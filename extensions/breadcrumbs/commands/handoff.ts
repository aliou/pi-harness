/**
 * Handoff command - /handoff [goal]
 *
 * Creates a new session with extracted context from the current session.
 * The goal guides what context to extract. The user is shown the extracted
 * prompt in an editor for review before the new session is created.
 */

import { createRunLogger, type SubagentLogger } from "@aliou/pi-agent-kit";
import { type Message, stream } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import {
  extractFilesFromSessionEntries,
  extractMentionedFiles,
} from "../lib/context-extractor";
import { writeHandoffMarker, writeHandoffSource } from "../lib/handoff-marker";
import {
  readCurrentSessionContent,
  readRawSessionContent,
} from "../lib/session-content-reader";

/**
 * System prompt for the context extraction LLM call.
 */
const EXTRACTION_SYSTEM_PROMPT = `You are a context extraction assistant. Given a conversation history and a goal for a new session, extract the FINAL STATE of what was accomplished.

CRITICAL: Focus on WHERE THINGS ENDED UP, not the journey. If something was planned then implemented, report it as IMPLEMENTED. If something was discussed then decided against, report the final decision. The new session needs to know the current state, not the full history.

Return your response in this exact format:

## Relevant Files

List file paths relevant to the goal (that exist or were created), one per line prefixed with "- ".

## Context

Summarize the FINAL STATE:
- What IS implemented (not "was discussed" or "needs to be done")
- Final decisions made (not alternatives that were rejected)
- Current technical details (APIs, data structures, patterns IN USE)
- What works and what is broken RIGHT NOW
- Any remaining open questions or next steps

Be factual and specific. Prioritize the END of the conversation over the beginning.`;

export function setupHandoffCommand(pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description: "Create a new session with context from the current session",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("handoff requires interactive mode", "error");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify(
          "Usage: /handoff <goal for new session>\nExample: /handoff implement OAuth support for Linear API",
          "error",
        );
        return;
      }

      // Create logger for debugging (uses same format as subagents)
      let logger: SubagentLogger | null = null;
      try {
        logger = await createRunLogger(ctx.cwd, "handoff", true);
      } catch {
        // Logging is optional, continue without it
      }

      const log = (msg: string): Promise<void> =>
        logger?.logEventRaw({ type: "handoff", message: msg }) ??
        Promise.resolve();

      await log(`Goal: ${goal}`);
      await log(`Session ID: ${ctx.sessionManager.getSessionId()}`);

      // Read session content (both formatted and raw)
      await log("Reading session content...");
      const sessionContent = readCurrentSessionContent(ctx.sessionManager);
      if (!sessionContent) {
        await log("ERROR: No session content");
        await logger?.close();
        ctx.ui.notify(
          "No session content to hand off (ephemeral or empty session)",
          "error",
        );
        return;
      }
      await log(`Session content: ${sessionContent.length} chars`);

      const rawContent = readRawSessionContent(ctx.sessionManager);
      await log(`Raw content: ${rawContent?.length ?? 0} chars`);

      // Extract mentioned files from both text patterns and tool call arguments
      await log("Extracting mentioned files...");
      const filesFromText = extractMentionedFiles(sessionContent, ctx.cwd);
      const filesFromTools = rawContent
        ? extractFilesFromSessionEntries(rawContent, ctx.cwd)
        : [];
      const mentionedFiles = Array.from(
        new Set([...filesFromText, ...filesFromTools]),
      ).sort();
      await log(`Found ${mentionedFiles.length} files`);

      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const parentSessionId = ctx.sessionManager.getSessionId() ?? "unknown";

      // Generate handoff prompt with a loader UI
      const model = ctx.model;
      await log(`Starting LLM extraction with model: ${model.name}`);

      const extractedContent = await ctx.ui.custom<string | null>(
        (tui, theme, _kb, done) => {
          const loader = new BorderedLoader(
            tui,
            theme,
            "Extracting handoff context...",
          );
          loader.onAbort = () => {
            log("Aborted by user").catch(() => {});
            done(null);
          };

          const doExtract = async () => {
            await log("Getting API key...");
            const apiKey = await ctx.modelRegistry.getApiKey(model);
            await log("API key obtained");

            const userMessage: Message = {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `## Goal for New Session\n\n${goal}\n\n## Available Files from Session\n\n${mentionedFiles.map((f) => `- ${f}`).join("\n") || "(none detected)"}\n\n## Session Content\n\n${sessionContent}`,
                },
              ],
              timestamp: Date.now(),
            };
            await log(
              `User message: ${JSON.stringify(userMessage.content).length} chars`,
            );

            await log("Starting stream...");
            const eventStream = stream(
              model,
              {
                systemPrompt: EXTRACTION_SYSTEM_PROMPT,
                messages: [userMessage],
              },
              { apiKey, signal: loader.signal },
            );

            // Stream and log the response
            let accumulated = "";
            for await (const event of eventStream) {
              if (event.type === "text_delta") {
                accumulated += event.delta;
                // Log delta to stream.log via logTextDelta
                await logger?.logTextDelta(event.delta, accumulated);
              }
            }

            const response = await eventStream.result();
            await log(`Stream complete, stopReason: ${response.stopReason}`);

            if (response.stopReason === "aborted") {
              return null;
            }

            return response.content
              .filter(
                (c): c is { type: "text"; text: string } => c.type === "text",
              )
              .map((c) => c.text)
              .join("\n");
          };

          doExtract()
            .then((result) => {
              log(`Extraction complete: ${result?.length ?? 0} chars`).catch(
                () => {},
              );
              done(result);
            })
            .catch((err) => {
              const errorMsg = err instanceof Error ? err.message : String(err);
              log(`ERROR: ${errorMsg}`).catch(() => {});
              console.error("Handoff extraction failed:", err);
              done(null);
            });

          return loader;
        },
      );

      if (extractedContent === null) {
        await log("Extraction returned null (cancelled or error)");
        await logger?.close();
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }

      await log(`Extracted content: ${extractedContent.length} chars`);

      await log("Creating new session...");

      // Create new session with parent tracking
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
        setup: async (sm) => {
          const newSessionId = sm.getSessionId();
          if (currentSessionFile && newSessionId) {
            writeHandoffMarker(currentSessionFile, newSessionId, goal);
          }
          if (extractedContent) {
            writeHandoffSource(sm, parentSessionId, goal, extractedContent);
          }
        },
      });

      if (newSessionResult.cancelled) {
        await log("Session creation cancelled");
        await logger?.close();
        ctx.ui.notify("Session creation cancelled", "info");
        return;
      }

      // Set just the goal in the editor -- context is in the custom entry
      ctx.ui.setEditorText(goal);

      await log("Handoff complete");
      await logger?.close();

      ctx.ui.notify("Handoff ready -- review and submit.", "info");
    },
  });
}
