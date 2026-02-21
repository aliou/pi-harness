import { randomUUID } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  MessageRenderOptions,
  SessionManager,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

export const HANDOFF_MARKER_CUSTOM_TYPE = "handoff-marker";
export const HANDOFF_SOURCE_CUSTOM_TYPE = "handoff-source";

export interface HandoffSourceDetails {
  parentSessionId: string;
  goal: string;
}

export interface HandoffMarkerDetails {
  targetSessionId: string;
  goal: string;
}

interface HandoffMarkerMessage {
  customType: string;
  content: string | Array<{ type: string; text?: string }>;
  details?: HandoffMarkerDetails;
}

/**
 * Find a session JSONL file by session ID and extract its display name.
 * Falls back to the session ID if the file can't be found or has no name.
 */
function resolveSessionName(sessionId: string): string {
  try {
    const sessionsDir = join(homedir(), ".pi", "agent", "sessions");
    const suffix = `_${sessionId}.jsonl`;

    // Scan subdirectories for a file ending with _<id>.jsonl
    for (const subdir of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!subdir.isDirectory()) continue;
      const dirPath = join(sessionsDir, subdir.name);
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith(suffix)) continue;

        // Found the file -- read and look for session_info with name
        const content = readFileSync(join(dirPath, file), "utf-8");
        const lines = content.split("\n");

        // Check lines in reverse -- latest name wins
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i]?.trim();
          if (!line || !line.includes("session_info")) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === "session_info" && entry.name) {
              return entry.name;
            }
          } catch {
            // skip malformed lines
          }
        }

        // No name found -- use first user message as fallback
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === "message" && entry.message?.role === "user") {
              const content = entry.message.content;
              const text =
                typeof content === "string"
                  ? content
                  : Array.isArray(content)
                    ? content
                        .filter(
                          (c: { type: string; text?: string }) =>
                            c.type === "text",
                        )
                        .map((c: { type: string; text?: string }) => c.text)
                        .join("")
                    : "";
              if (text) return text.slice(0, 60);
            }
          } catch {
            // skip
          }
        }

        return sessionId;
      }
    }
  } catch {
    // fs errors -- fall back to ID
  }
  return sessionId;
}

/**
 * Register the handoff marker message renderer.
 * Displays "Handed off to -> {sessionName}" for every entry with details.
 */
export function setupHandoffMarkerRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer<HandoffMarkerDetails>(
    HANDOFF_MARKER_CUSTOM_TYPE,
    (
      message: HandoffMarkerMessage,
      _options: MessageRenderOptions,
      theme: Theme,
    ) => {
      const details = message.details;

      if (!details) {
        return undefined;
      }

      const targetSessionId = details.targetSessionId;
      const displayName = resolveSessionName(targetSessionId);
      const label = theme.fg("muted", "Handed off to ");
      const displayText = `${label}${theme.fg("accent", displayName)}`;

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(displayText, 0, 0));
      return box;
    },
  );
}

interface HandoffSourceMessage {
  customType: string;
  content: string | Array<{ type: string; text?: string }>;
  details?: HandoffSourceDetails;
}

/**
 * Register the handoff source message renderer.
 * Displays "Continuing from {sessionName}" for every entry with details.
 */
export function setupHandoffSourceRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer<HandoffSourceDetails>(
    HANDOFF_SOURCE_CUSTOM_TYPE,
    (
      message: HandoffSourceMessage,
      _options: MessageRenderOptions,
      theme: Theme,
    ) => {
      const details = message.details;

      if (!details) {
        return undefined;
      }

      const parentSessionId = details.parentSessionId;
      const displayName = resolveSessionName(parentSessionId);
      const label = theme.fg("muted", "Continuing from ");
      const displayText = `${label}${theme.fg("accent", displayName)}`;

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(displayText, 0, 0));
      return box;
    },
  );
}

/**
 * Write a handoff source entry to the new session.
 *
 * Appends a `custom_message` entry with the extracted context and a
 * reference back to the parent session.
 *
 * @param sm - The new session's SessionManager
 * @param parentSessionId - The ID of the session being handed off from
 * @param goal - The handoff goal
 * @param extractedContext - The extracted context from the parent session
 */
export function writeHandoffSource(
  sm: SessionManager,
  parentSessionId: string,
  goal: string,
  extractedContext: string,
): void {
  const content = `Continuing from session ${parentSessionId}.\n\nThe context below is a summary. If you need more details, read the parent session:\n\nread_session({ sessionId: "${parentSessionId}", goal: "Get the last assistant message with the full plan and context" })\n\n${extractedContext}`;
  sm.appendCustomMessageEntry<HandoffSourceDetails>(
    HANDOFF_SOURCE_CUSTOM_TYPE,
    content,
    true,
    { parentSessionId, goal },
  );
}

/**
 * Write a handoff marker entry directly to the parent session file.
 *
 * Appends a well-formed `custom_message` JSONL entry with the real new
 * session ID. Call this from the `setup` callback of `newSession`, where
 * both the session file path (captured in closure) and the new session ID
 * (via `sm.getSessionId()`) are available.
 *
 * @param sessionFile - Path to the parent session JSONL file
 * @param targetSessionId - The new session ID to link to
 * @param goal - The handoff goal, shown in the marker
 */
export function writeHandoffMarker(
  sessionFile: string,
  targetSessionId: string,
  goal: string,
): void {
  const entry = {
    type: "custom_message",
    customType: HANDOFF_MARKER_CUSTOM_TYPE,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    content: "",
    display: true,
    details: { targetSessionId, goal } satisfies HandoffMarkerDetails,
  };
  appendFileSync(sessionFile, `\n${JSON.stringify(entry)}`);
}
