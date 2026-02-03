/**
 * Prevent direct agent access to the sessions directory.
 *
 * Blocks read, write, edit, and bash commands that target session files.
 * Agents should use find_sessions and read_session tools instead.
 */

import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function getSessionsDir(): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "sessions");
}

/**
 * Check if a resolved absolute path falls within the sessions directory.
 */
function isInSessionsDir(path: string): boolean {
  const sessionsDir = getSessionsDir();
  const absolutePath = resolve(path);
  const rel = relative(sessionsDir, absolutePath);

  // Outside sessionsDir if relative path starts with ".." or is absolute.
  return rel !== "" && !rel.startsWith("..") && !resolve(rel).startsWith("/");
}

const BLOCK_MESSAGE =
  "Direct access to session files is not allowed. " +
  "Use find_sessions to search for sessions by keyword, " +
  "then read_session to extract information from a specific session.";

const FILE_TOOLS = new Set(["read", "write", "edit"]);

/**
 * Hook that blocks direct file access to the sessions directory.
 */
export function setupProtectSessionsDirHook(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // File tools: check path / file_path parameter.
    if (FILE_TOOLS.has(event.toolName)) {
      const input = event.input as Record<string, unknown>;
      const path = String(input.path ?? input.file_path ?? "");
      if (path && isInSessionsDir(path)) {
        ctx.ui.notify("Blocked: use find_sessions / read_session", "warning");
        return { block: true, reason: BLOCK_MESSAGE };
      }
      return;
    }

    // Bash: check if command references sessions directory.
    if (event.toolName === "bash") {
      const command = String(event.input.command ?? "");
      const sessionsDir = getSessionsDir();

      if (
        command.includes(sessionsDir) ||
        command.includes("/.pi/agent/sessions")
      ) {
        ctx.ui.notify("Blocked: use find_sessions / read_session", "warning");
        return { block: true, reason: BLOCK_MESSAGE };
      }
    }

    return;
  });
}
