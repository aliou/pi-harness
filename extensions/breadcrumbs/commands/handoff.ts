/**
 * Handoff command - /handoff [goal]
 *
 * Creates a new session with extracted context from the current session.
 * The goal guides what context to extract. The user is shown the extracted
 * prompt in an editor for review before the new session is created.
 */

import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import {
  extractFilesFromSessionEntries,
  extractMentionedFiles,
} from "../lib/context-extractor";
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

      // Read session content (both formatted and raw)
      const sessionContent = readCurrentSessionContent(ctx.sessionManager);
      if (!sessionContent) {
        ctx.ui.notify(
          "No session content to hand off (ephemeral or empty session)",
          "error",
        );
        return;
      }

      const rawContent = readRawSessionContent(ctx.sessionManager);

      // Extract mentioned files from both text patterns and tool call arguments
      const filesFromText = extractMentionedFiles(sessionContent, ctx.cwd);
      const filesFromTools = rawContent
        ? extractFilesFromSessionEntries(rawContent, ctx.cwd)
        : [];
      const mentionedFiles = Array.from(
        new Set([...filesFromText, ...filesFromTools]),
      ).sort();

      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const parentSessionId = ctx.sessionManager.getSessionId() ?? "unknown";

      // Generate handoff prompt with a loader UI
      const model = ctx.model;
      const extractedContent = await ctx.ui.custom<string | null>(
        (tui, theme, _kb, done) => {
          const loader = new BorderedLoader(
            tui,
            theme,
            "Extracting handoff context...",
          );
          loader.onAbort = () => done(null);

          const doExtract = async () => {
            const apiKey = await ctx.modelRegistry.getApiKey(model);

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

            const response = await complete(
              model,
              {
                systemPrompt: EXTRACTION_SYSTEM_PROMPT,
                messages: [userMessage],
              },
              { apiKey, signal: loader.signal },
            );

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
            .then(done)
            .catch((err) => {
              console.error("Handoff extraction failed:", err);
              done(null);
            });

          return loader;
        },
      );

      if (extractedContent === null) {
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }

      // Build the full handoff message
      const handoffMessage = `Continuing from session ${parentSessionId}.

**Important:** The context below is a summary. If you need more details (full plans, code examples, ASCII diagrams, or reasoning), read the parent session's final messages:

\`\`\`
read_session({ sessionId: "${parentSessionId}", goal: "Get the last assistant message with the full plan and context" })
\`\`\`

${extractedContent}

## Goal

${goal}`;

      // Let user review and edit the handoff prompt
      const editedPrompt = await ctx.ui.editor(
        "Edit handoff prompt",
        handoffMessage,
      );

      if (editedPrompt === undefined) {
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }

      // Emit marker in parent session before creating new session
      pi.appendEntry("handoff", {
        goal,
        timestamp: new Date().toISOString(),
      });

      // Create new session with parent tracking
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
      });

      if (newSessionResult.cancelled) {
        ctx.ui.notify("Session creation cancelled", "info");
        return;
      }

      // Set the handoff prompt in the editor and name the session
      ctx.ui.setEditorText(editedPrompt);
      pi.setSessionName(`Handoff: ${goal.slice(0, 50)}`);
      ctx.ui.notify("Handoff ready -- review and submit.", "info");
    },
  });
}
