/**
 * Prevent direct agent access to the sessions directory.
 *
 * Blocks read, write, edit, and bash commands that target session files.
 * Agents should use find_sessions and read_session tools instead.
 */

import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
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

  // Inside sessionsDir if the relative path does not escape via ".." and is not absolute.
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

const BLOCK_MESSAGE =
  "Direct access to session files is restricted. " +
  "Prefer find_sessions + read_session. " +
  "Direct read may be allowed with explicit user confirmation.";

const FILE_TOOLS = new Set(["read", "write", "edit"]);

/**
 * Hook that gates direct file access to the sessions directory.
 *
 * Default behavior:
 * - read: prompt the user for confirmation (requires UI). If no UI, deny.
 * - write/edit: still blocked unconditionally.
 * - bash: still blocked unconditionally (too hard to safely scope).
 */
export function setupProtectSessionsDirHook(pi: ExtensionAPI) {
  // Session-only allowlist for explicit user approvals.
  // Keyed by resolved absolute path.
  const allowedReadPaths = new Set<string>();

  pi.on("tool_call", async (event, ctx) => {
    // File tools: check path / file_path parameter.
    if (FILE_TOOLS.has(event.toolName)) {
      const input = event.input as Record<string, unknown>;
      const rawPath = String(input.path ?? input.file_path ?? "");
      if (!rawPath) return;

      // Only gate when we can confidently resolve the path.
      // For non-absolute paths, we cannot resolve against the agent's cwd here,
      // so we keep the old safe behavior and block.
      const resolvedPath = isAbsolute(rawPath) ? resolve(rawPath) : null;

      if (resolvedPath && isInSessionsDir(resolvedPath)) {
        if (event.toolName !== "read") {
          ctx.ui.notify("Blocked: session file write/edit", "warning");
          return { block: true, reason: BLOCK_MESSAGE };
        }

        // read: allow if previously approved for this session.
        if (allowedReadPaths.has(resolvedPath)) return;

        // In print/RPC mode, deny by default (safe fallback).
        if (!ctx.hasUI) {
          ctx.ui.notify(
            "Blocked: session file read (no UI to confirm)",
            "warning",
          );
          return {
            block: true,
            reason:
              "Direct access to session files requires explicit user confirmation, but no UI is available.",
          };
        }

        const title = "Read session file?";
        const msg =
          "The agent is trying to read a Pi session JSONL file directly:\n\n" +
          `${resolvedPath}\n\n` +
          "Allow this read? (This approval is only for the current session.)";

        const confirm = await ctx.ui.confirm(title, msg);
        if (!confirm) {
          ctx.ui.notify("Denied: session file read", "warning");
          return { block: true, reason: "User denied session file read" };
        }

        allowedReadPaths.add(resolvedPath);
        ctx.ui.notify("Allowed: session file read (this session)", "info");
        return;
      }

      // If we can't confidently resolve, keep conservative behavior.
      // Note: isInSessionsDir() resolves paths internally; for relative paths we
      // don't know the correct base dir here, so treat these as suspicious.
      if (!resolvedPath && rawPath.includes("/.pi/agent/sessions")) {
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
