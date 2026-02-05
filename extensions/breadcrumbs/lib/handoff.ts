/**
 * Shared handoff logic used by both the /handoff command and the handoff tool.
 *
 * Extracts context from the current session and creates a new session
 * with the extracted context as the initial message.
 */

import { complete, type Message } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  extractFilesFromSessionEntries,
  extractMentionedFiles,
} from "./context-extractor";
import {
  readCurrentSessionContent,
  readRawSessionContent,
} from "./session-content-reader";

/**
 * Result of a successful handoff.
 */
export interface HandoffResult {
  goal: string;
  parentSessionId: string;
  filesExtracted: number;
  contextLength: number;
}

/**
 * System prompt for the context extraction LLM call.
 *
 * The model extracts relevant context from the session -- it does not
 * generate instructions. The user's goal guides what to extract.
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

/**
 * Execute a handoff: extract context from the current session and create
 * a new session with that context.
 *
 * Works from both command context (has newSession) and tool context
 * (caller handles session creation).
 */
export async function extractHandoffContext(
  goal: string,
  ctx: ExtensionContext,
): Promise<{ message: string; filesExtracted: number; contextLength: number }> {
  // Read session content (both formatted and raw)
  const sessionContent = readCurrentSessionContent(ctx.sessionManager);
  if (!sessionContent) {
    throw new Error(
      "Cannot read current session content. Is this an ephemeral session?",
    );
  }

  const rawContent = readRawSessionContent(ctx.sessionManager);

  // Extract mentioned files from both text patterns and tool call arguments
  const filesFromText = extractMentionedFiles(sessionContent, ctx.cwd);
  const filesFromTools = rawContent
    ? extractFilesFromSessionEntries(rawContent, ctx.cwd)
    : [];

  // Merge and deduplicate
  const mentionedFiles = Array.from(
    new Set([...filesFromText, ...filesFromTools]),
  ).sort();

  if (!ctx.model) {
    throw new Error("No model selected");
  }

  // Use LLM to extract relevant context
  const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
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
    ctx.model,
    { systemPrompt: EXTRACTION_SYSTEM_PROMPT, messages: [userMessage] },
    { apiKey },
  );

  const extractedContent = response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  if (!extractedContent) {
    throw new Error("Context extraction returned empty result");
  }

  // Get session identifiers
  const sessionId = ctx.sessionManager.getSessionId() ?? "unknown";

  // Build the handoff message
  const handoffMessage = buildHandoffMessage(sessionId, goal, extractedContent);

  return {
    message: handoffMessage,
    filesExtracted: mentionedFiles.length,
    contextLength: extractedContent.length,
  };
}

/**
 * Execute a full handoff from a command context: extract context, create
 * a new session, and send the handoff message.
 */
export async function executeHandoff(
  goal: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<HandoffResult> {
  const parentSessionId = ctx.sessionManager.getSessionId() ?? "unknown";
  const currentSessionFile = ctx.sessionManager.getSessionFile();

  // Extract context
  const { message, filesExtracted, contextLength } =
    await extractHandoffContext(goal, ctx);

  // Emit marker in parent session before creating new session
  pi.appendEntry("handoff", {
    goal,
    timestamp: new Date().toISOString(),
  });

  // Create new session with parent tracking
  const result = await ctx.newSession({
    parentSession: currentSessionFile,
  });

  if (result.cancelled) {
    throw new Error("Session creation cancelled");
  }

  // Send the handoff message to the new session
  pi.sendUserMessage(message);

  // Update parent session name is not possible after newSession
  // (we're now in the new session), but we can set the new session name
  pi.setSessionName(`Handoff: ${goal.slice(0, 50)}`);

  return {
    goal,
    parentSessionId,
    filesExtracted,
    contextLength,
  };
}

/**
 * Build the handoff message that will be sent to the new session.
 */
function buildHandoffMessage(
  parentSessionId: string,
  goal: string,
  extractedContext: string,
): string {
  return `Continuing from session ${parentSessionId}.

**Important:** The context below is a summary. If you need more details (full plans, code examples, ASCII diagrams, or reasoning), read the parent session's final messages:

\`\`\`
read_session({ sessionId: "${parentSessionId}", goal: "Get the last assistant message with the full plan and context" })
\`\`\`

${extractedContext}

## Goal

${goal}`;
}
