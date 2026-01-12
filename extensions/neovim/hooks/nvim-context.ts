/**
 * Neovim Context Hook
 *
 * Lifecycle events:
 * - session_start: auto-connects to Neovim instance
 * - tool_result: reloads files in Neovim when write/edit tools complete
 * - turn_end: sends LSP errors for modified files
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  type DiscoveredInstance,
  discoverNvim,
  type ExecFn,
  queryNvim,
} from "../nvim";

// ============================================================================
// Types
// ============================================================================

interface FileDiagnostic {
  line: number;
  col: number;
  message: string;
  source?: string;
}

type DiagnosticsForFilesResult = Record<string, FileDiagnostic[]>;

interface InstanceInfo {
  instance: DiscoveredInstance;
  label: string;
}

// ============================================================================
// Connection State
// ============================================================================

export interface NvimConnectionState {
  socket: string | null;
  lockfile: string | null;
  modifiedFilesThisTurn: Set<string>;
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
 * Query each instance for its current file to build a useful selection label.
 */
async function getInstanceInfo(
  exec: ExecFn,
  instance: DiscoveredInstance,
): Promise<InstanceInfo> {
  try {
    const result = await queryNvim(exec, instance.lockfile.socket, "context", {
      timeout: 1000,
    });
    const ctx = result as {
      file?: string;
      cursor?: { line: number };
      filetype?: string;
    } | null;

    if (ctx?.file) {
      const filename = ctx.file.split("/").pop() ?? ctx.file;
      const pos = ctx.cursor ? `:${ctx.cursor.line}` : "";
      return {
        instance,
        label: `${filename}${pos}${ctx.filetype ? ` (${ctx.filetype})` : ""}`,
      };
    }
  } catch {
    // Query failed, fall back to basic info
  }

  return {
    instance,
    label: `[no file] PID ${instance.lockfile.pid}`,
  };
}

/**
 * Format diagnostics into a message for the LLM.
 */
function formatDiagnosticsMessage(
  diagnostics: DiagnosticsForFilesResult,
  cwd: string,
): string {
  const lines: string[] = ["LSP errors detected in modified files:"];

  for (const [file, errors] of Object.entries(diagnostics)) {
    const filePath = formatPath(file, cwd);
    lines.push(`\n${filePath}:`);
    for (const err of errors) {
      const source = err.source ? ` (${err.source})` : "";
      lines.push(`  L${err.line}:${err.col}: ${err.message}${source}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Hook Registration
// ============================================================================

export function registerNvimContextHook(
  pi: ExtensionAPI,
  state: NvimConnectionState,
) {
  // -------------------------------------------------------------------------
  // Session start: auto-connect to Neovim
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    // Reset state
    state.socket = null;
    state.lockfile = null;
    state.modifiedFilesThisTurn = new Set();

    const instances = discoverNvim(ctx.cwd);
    if (instances.length === 0) {
      return;
    }

    let selectedInstance: DiscoveredInstance;

    if (instances.length === 1) {
      selectedInstance = instances[0];
    } else {
      // Multiple instances: prompt user to select
      if (!ctx.hasUI) {
        ctx.ui.notify(
          `nvim: Multiple instances found, cannot prompt in headless mode`,
          "warning",
        );
        return;
      }

      // Query each instance for its current file to build useful labels
      const infos = await Promise.all(
        instances.map((i) => getInstanceInfo(pi.exec, i)),
      );
      const options = infos.map((info) => info.label);
      const selected = await ctx.ui.select(
        "Multiple Neovim instances found. Select one:",
        options,
      );

      if (!selected) {
        ctx.ui.notify("nvim: No instance selected", "info");
        return;
      }

      // Find the matching instance
      const index = options.indexOf(selected);
      selectedInstance = infos[index].instance;
    }

    state.socket = selectedInstance.lockfile.socket;
    state.lockfile = selectedInstance.lockfilePath;
    ctx.ui.notify(
      `nvim: Connected to Neovim (PID ${selectedInstance.lockfile.pid})`,
      "info",
    );

    // Notify Neovim via RPC
    try {
      await queryNvim(pi.exec, state.socket, {
        type: "notify",
        message: "Connected",
        level: "info",
      });
    } catch {
      // Ignore notification failures
    }
  });

  // -------------------------------------------------------------------------
  // Tool result: reload files and track modifications
  // -------------------------------------------------------------------------

  pi.on("tool_result", async (event, ctx) => {
    // Track modified files for diagnostics at turn end
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input?.path as string | undefined;
      if (filePath && !event.isError) {
        // Convert to absolute path for consistent tracking
        const absPath = path.resolve(ctx.cwd, filePath);
        state.modifiedFilesThisTurn.add(absPath);

        // Notify Neovim to reload the file
        if (state.socket) {
          try {
            await queryNvim(
              pi.exec,
              state.socket,
              {
                type: "reload",
                files: [absPath],
              },
              { timeout: 2000 },
            );
          } catch {
            // Ignore reload failures
          }
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // Turn end: send LSP errors for modified files
  // -------------------------------------------------------------------------

  pi.on("turn_end", async (_event, ctx) => {
    if (!state.socket) return;
    if (state.modifiedFilesThisTurn.size === 0) return;

    try {
      const diagnostics = (await queryNvim(
        pi.exec,
        state.socket,
        {
          type: "diagnostics_for_files",
          files: Array.from(state.modifiedFilesThisTurn),
        },
        { timeout: 3000 },
      )) as DiagnosticsForFilesResult | null;

      // Only send if there are errors
      if (!diagnostics || Object.keys(diagnostics).length === 0) {
        return;
      }

      const message = formatDiagnosticsMessage(diagnostics, ctx.cwd);

      // Send as a follow-up message (waits for agent to finish)
      pi.sendMessage(
        {
          customType: "nvim-diagnostics",
          content: message,
          display: true,
          details: { diagnostics },
        },
        {
          deliverAs: "followUp",
          triggerTurn: true,
        },
      );
    } catch {
      // Query failed, skip diagnostics
    }
  });
}
