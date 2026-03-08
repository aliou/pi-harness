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
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";

export type SessionLinkType = "handoff" | "continue";

export const SESSION_LINK_MARKER_TYPE = "session-link-marker";
export const SESSION_LINK_SOURCE_TYPE = "session-link-source";

export interface SessionLinkMarkerDetails {
  targetSessionId: string;
  goal: string;
  linkType: SessionLinkType;
}

export interface SessionLinkSourceDetails {
  parentSessionId: string;
  goal: string;
  linkType: SessionLinkType;
}

interface SessionLinkMessage {
  customType: string;
  content: string | Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
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
 * Register the session link marker message renderer.
 * Displays "Handed off to {name}" or "Continues in {name}" depending on linkType.
 */
export function setupSessionLinkMarkerRenderer(pi: ExtensionAPI) {
  const renderMarker = (
    message: SessionLinkMessage,
    _options: MessageRenderOptions,
    theme: Theme,
  ) => {
    const details = message.details;

    if (!details) {
      return undefined;
    }

    const targetSessionId = details.targetSessionId as string | undefined;
    if (!targetSessionId) {
      return undefined;
    }

    const linkType =
      (details.linkType as SessionLinkType | undefined) ?? "handoff";
    const displayName = resolveSessionName(targetSessionId);
    const labelText =
      linkType === "continue" ? "Continues in " : "Handed off to ";
    const label = theme.fg("muted", labelText);
    const displayText = `${label}${theme.fg("accent", displayName)}`;

    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(displayText, 0, 0));
    return box;
  };

  pi.registerMessageRenderer(SESSION_LINK_MARKER_TYPE, renderMarker);
}

/**
 * Register the session link source message renderer.
 * Collapsed: header line with optional expand hint (only when content is non-empty).
 * Expanded: header + full context content.
 */
export function setupSessionLinkSourceRenderer(pi: ExtensionAPI) {
  const renderSource = (
    message: SessionLinkMessage,
    options: MessageRenderOptions,
    theme: Theme,
  ) => {
    const details = message.details;

    if (!details) {
      return undefined;
    }

    const parentSessionId = details.parentSessionId as string | undefined;
    if (!parentSessionId) {
      return undefined;
    }

    const { expanded } = options;
    const linkType =
      (details.linkType as SessionLinkType | undefined) ?? "handoff";
    const displayName = resolveSessionName(parentSessionId);
    const labelText =
      linkType === "continue" ? "Continued from " : "Continuing from ";
    const label = theme.fg("muted", labelText);
    const header = `${label}${theme.fg("accent", displayName)}`;

    const content =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((c: { type: string; text?: string }) => c.type === "text")
              .map((c: { type: string; text?: string }) => c.text ?? "")
              .join("")
          : "";

    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(header, 0, 0));

    if (content) {
      if (expanded) {
        // Show the full content below the header
        box.addChild(new Text("", 0, 0)); // spacer

        try {
          const md = new Markdown(content, 0, 0, getMarkdownTheme());
          box.addChild(md);
        } catch {
          // Fallback to plain text if markdown rendering fails
          box.addChild(new Text(theme.fg("muted", content), 0, 0));
        }
      } else {
        box.addChild(new Text(theme.fg("dim", "Press Ctrl+O to expand"), 0, 0));
      }
    }

    return box;
  };

  pi.registerMessageRenderer(SESSION_LINK_SOURCE_TYPE, renderSource);
}

/**
 * Write a session link source entry to the new session.
 *
 * @param sm - The new session's SessionManager
 * @param parentSessionId - The ID of the session being linked from
 * @param goal - The session link goal
 * @param linkType - Whether this is a "handoff" or "continue" link
 * @param content - Optional content to display in the expanded view
 */
export function writeSessionLinkSource(
  sm: SessionManager,
  parentSessionId: string,
  goal: string,
  linkType: SessionLinkType,
  content?: string,
): void {
  sm.appendCustomMessageEntry<SessionLinkSourceDetails>(
    SESSION_LINK_SOURCE_TYPE,
    content ?? "",
    true,
    { parentSessionId, goal, linkType },
  );
}

/**
 * Write a session link marker entry directly to the parent session file.
 *
 * Appends a well-formed `custom_message` JSONL entry with the new session ID.
 *
 * @param sessionFile - Path to the parent session JSONL file
 * @param targetSessionId - The new session ID to link to
 * @param goal - The session link goal
 * @param linkType - Whether this is a "handoff" or "continue" link
 * @param parentId - The leaf ID of the parent session (for tree structure)
 */
export function writeSessionLinkMarker(
  sessionFile: string,
  targetSessionId: string,
  goal: string,
  linkType: SessionLinkType,
  parentId: string,
): void {
  const entry = {
    type: "custom_message",
    customType: SESSION_LINK_MARKER_TYPE,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    content: "",
    display: true,
    parentId,
    details: {
      targetSessionId,
      goal,
      linkType,
    } satisfies SessionLinkMarkerDetails,
  };
  appendFileSync(sessionFile, `\n${JSON.stringify(entry)}`);
}
