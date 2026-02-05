/**
 * Session content reader for handoff context extraction.
 *
 * Reads the current session's JSONL file and extracts conversation content
 * in a format suitable for LLM-based context extraction.
 */

import { readFileSync } from "node:fs";
import type {
  AssistantMessage,
  TextContent,
  ToolCall,
  UserMessage,
} from "@mariozechner/pi-ai";
import type {
  ExtensionContext,
  SessionEntry,
  SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import { parseSessionEntries } from "@mariozechner/pi-coding-agent";

/**
 * Read the raw JSONL content from the current session file.
 *
 * Returns null if:
 * - No session file exists (ephemeral session)
 * - Session file is empty or unreadable
 */
export function readRawSessionContent(
  sessionManager: ExtensionContext["sessionManager"],
): string | null {
  const sessionFile = sessionManager.getSessionFile();
  if (!sessionFile) return null;

  try {
    const raw = readFileSync(sessionFile, "utf-8");
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Maximum characters for session content to avoid overwhelming the extraction LLM.
 * ~100k chars is roughly 25k tokens, leaving room for the extraction prompt.
 */
const MAX_SESSION_CONTENT_CHARS = 100_000;

/**
 * Read the current session file and return a text representation
 * of the conversation, filtering out system prompts and tool definitions.
 *
 * For large sessions, only the most recent messages are included (up to
 * MAX_SESSION_CONTENT_CHARS). A note is prepended indicating truncation.
 *
 * Returns null if:
 * - No session file exists (ephemeral session)
 * - Session file is empty or unreadable
 * - No conversation messages found
 */
export function readCurrentSessionContent(
  sessionManager: ExtensionContext["sessionManager"],
): string | null {
  const raw = readRawSessionContent(sessionManager);
  if (!raw) return null;

  const entries = parseSessionEntries(raw);
  if (entries.length === 0) return null;

  const lines: string[] = [];

  for (const entry of entries) {
    const sessionEntry = entry as SessionEntry;
    if (sessionEntry.type !== "message") continue;

    const msgEntry = sessionEntry as SessionMessageEntry;
    const msg = msgEntry.message;

    if (msg.role === "user") {
      const userMsg = msg as UserMessage;
      const text = extractText(userMsg.content);
      if (text) {
        lines.push(`## User\n\n${text}`);
      }
    } else if (msg.role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      const parts: string[] = [];

      for (const block of assistantMsg.content) {
        if (block.type === "text") {
          const textBlock = block as TextContent;
          parts.push(textBlock.text);
        } else if (block.type === "toolCall") {
          const tc = block as ToolCall;
          parts.push(`[Tool call: ${tc.name}(${formatArgs(tc.arguments)})]`);
        }
      }

      const text = parts.join("\n");
      if (text) {
        lines.push(`## Assistant\n\n${text}`);
      }
    } else if (msg.role === "toolResult") {
      // Skip tool results - they add noise without useful summary.
      // The tool call itself (name + args) is already captured above.
      // Including raw output bloats context and causes verbatim copying.
      void msg;
    }
  }

  if (lines.length === 0) return null;

  // Join and check size
  const separator = "\n\n---\n\n";
  let content = lines.join(separator);

  // If content is too large, keep only the most recent messages
  if (content.length > MAX_SESSION_CONTENT_CHARS) {
    const truncatedLines: string[] = [];
    let totalLength = 0;

    // Work backwards from the end (most recent messages)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      const lineLength = line.length + separator.length;

      if (totalLength + lineLength > MAX_SESSION_CONTENT_CHARS) {
        break;
      }

      truncatedLines.unshift(line);
      totalLength += lineLength;
    }

    const truncationNote = `[Session truncated: showing last ${truncatedLines.length} of ${lines.length} messages to fit context limit]\n\n---\n\n`;
    content = truncationNote + truncatedLines.join(separator);
  }

  return content;
}

/**
 * Extract text from user message content (string or content array).
 */
function extractText(
  content: string | (TextContent | { type: string; text?: string })[],
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is TextContent =>
          typeof c === "object" && c !== null && c.type === "text",
      )
      .map((c) => c.text)
      .join("\n");
  }
  return "";
}

/**
 * Format tool call arguments for display.
 * Shows a compact representation of the arguments.
 */
function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";

  return entries
    .map(([key, value]) => {
      if (typeof value === "string") {
        const truncated =
          value.length > 80 ? `${value.slice(0, 80)}...` : value;
        return `${key}: "${truncated}"`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(", ");
}
