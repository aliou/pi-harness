/**
 * Inject Neovim Context Hook
 *
 * Injects dynamic editor context (splits, cursor position) before each prompt.
 * Runs on every prompt via before_agent_start hook.
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { queryNvim } from "../nvim";
import type { NvimConnectionState } from "./nvim-context";

// ============================================================================
// Types
// ============================================================================

interface SplitInfo {
  file: string;
  filetype: string;
  visible_range: { first: number; last: number };
  cursor?: { line: number; col: number };
  is_focused: boolean;
  modified: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a file path: relative if inside cwd, absolute otherwise.
 */
function formatPath(filePath: string, cwd: string): string {
  if (!filePath) return "<unnamed>";

  const normalized = path.resolve(filePath);
  const normalizedCwd = path.resolve(cwd);

  if (normalized.startsWith(normalizedCwd + path.sep)) {
    return path.relative(cwd, normalized);
  }

  return normalized;
}

/**
 * Format splits info into a human-readable context string.
 */
function formatSplitsContext(splits: SplitInfo[], cwd: string): string {
  if (splits.length === 0) {
    return "No files are currently open in the editor.";
  }

  const lines: string[] = ["Current editor state:"];

  for (const split of splits) {
    const filePath = formatPath(split.file, cwd);
    const marker = split.is_focused ? " [focused]" : "";
    const modified = split.modified ? " [modified]" : "";

    let line = `- ${filePath}${marker}${modified}`;
    line += ` (${split.filetype || "unknown"})`;
    line += ` visible lines ${split.visible_range.first}-${split.visible_range.last}`;

    if (split.is_focused && split.cursor) {
      line += `, cursor at line ${split.cursor.line}:${split.cursor.col}`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

// ============================================================================
// Hook Registration
// ============================================================================

export function registerInjectNvimContextHook(
  pi: ExtensionAPI,
  state: NvimConnectionState,
) {
  pi.on("before_agent_start", async (_event, ctx) => {
    // Reset modified files tracking for new prompt
    state.modifiedFilesThisTurn = new Set();

    if (!state.socket) return;

    try {
      const splits = (await queryNvim(pi.exec, state.socket, "splits", {
        timeout: 2000,
      })) as SplitInfo[] | null;

      if (splits && splits.length > 0) {
        const context = formatSplitsContext(splits, ctx.cwd);
        return {
          message: {
            customType: "nvim-context",
            content: context,
            display: false,
          },
        };
      }
    } catch {
      // Query failed, continue without dynamic context
    }
  });
}
