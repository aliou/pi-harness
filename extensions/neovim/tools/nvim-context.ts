/**
 * Neovim Context Tool
 *
 * Query the connected Neovim editor for context information:
 * - context: current file, cursor position, selection, filetype
 * - diagnostics: LSP diagnostics for current buffer
 * - current_function: treesitter info about function/class at cursor
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { NvimConnectionState } from "../hooks";
import { discoverNvim, queryNvim } from "../nvim";

// ============================================================================
// Types
// ============================================================================

interface NvimContext {
  file: string;
  cursor: { line: number; col: number };
  selection?: {
    start: { line: number; col: number };
    end: { line: number; col: number };
  };
  filetype: string;
  content?: string;
}

interface DiagnosticItem {
  lnum: number;
  col: number;
  severity: number;
  message: string;
  source?: string;
}

type DiagnosticsResult = DiagnosticItem[];

interface CurrentFunctionResult {
  name?: string;
  type?: string;
  start_line?: number;
  end_line?: number;
}

interface SplitInfo {
  file: string;
  filetype: string;
  visible_range: { first: number; last: number };
  cursor?: { line: number; col: number };
  is_focused: boolean;
  modified: boolean;
}

type SplitsResult = SplitInfo[];

type NvimResult =
  | NvimContext
  | DiagnosticsResult
  | CurrentFunctionResult
  | SplitsResult
  | null;

interface NvimContextDetails {
  action: "context" | "diagnostics" | "current_function" | "splits";
  result: NvimResult;
  cwd: string;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a file path: relative if inside cwd, absolute otherwise.
 */
function formatPath(filePath: string, cwd: string): string {
  if (!filePath) return "<no file>";

  const normalized = path.resolve(filePath);
  const normalizedCwd = path.resolve(cwd);

  if (normalized.startsWith(normalizedCwd + path.sep)) {
    return path.relative(cwd, normalized);
  }

  return normalized;
}

/**
 * Get severity label for LSP diagnostic severity.
 */
function severityLabel(severity: number): string {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return "unknown";
  }
}

// ============================================================================
// Tool parameters
// ============================================================================

const NvimContextParams = Type.Object({
  action: StringEnum(
    ["context", "diagnostics", "current_function", "splits"] as const,
    {
      description: "The type of context to retrieve from Neovim",
    },
  ),
});

// ============================================================================
// Tool registration
// ============================================================================

export function registerNvimContextTool(
  pi: ExtensionAPI,
  state: NvimConnectionState,
) {
  pi.registerTool({
    name: "nvim_context",
    label: "Neovim Context",
    description: `Query the connected Neovim editor for context information.

Available actions:
- "context": current file, cursor position, selection, filetype (focused split only)
- "splits": all visible splits with metadata (file, filetype, visible lines, focused flag)
- "diagnostics": LSP diagnostics for current buffer
- "current_function": treesitter info about function/class at cursor

Use this tool when you need to know what the user is currently looking at in their editor.`,

    parameters: NvimContextParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let socket: string | null = null;

      // If we have a stored socket, check if its lockfile still exists
      if (state.socket && state.lockfile && existsSync(state.lockfile)) {
        socket = state.socket;
      }

      // If we don't have a valid socket, discover
      if (!socket) {
        const instances = discoverNvim(ctx.cwd);

        if (instances.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No Neovim instance found in current directory. Make sure Neovim is running with pi-nvim enabled.",
              },
            ],
            details: {
              action: params.action,
              result: null,
              cwd: ctx.cwd,
              error: "No Neovim instance found",
            },
          };
        }

        if (instances.length === 1) {
          const instance = instances[0];
          if (!instance) {
            return {
              content: [
                {
                  type: "text",
                  text: "nvim: No instance available",
                },
              ],
              details: { success: false },
            };
          }
          socket = instance.lockfile.socket;
          state.socket = socket;
          state.lockfile = instance.lockfilePath;
        } else {
          // Multiple instances found
          if (!ctx.hasUI) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    "Multiple Neovim instances found. Cannot prompt for selection in non-interactive mode.\n\n" +
                    instances.map((i) => i.lockfilePath).join("\n"),
                },
              ],
              details: {
                action: params.action,
                result: null,
                cwd: ctx.cwd,
                error: "Multiple instances, no UI",
              },
            };
          }

          const selected = await ctx.ui.select(
            "Multiple Neovim instances found",
            instances.map((i) => i.lockfilePath),
          );

          if (!selected) {
            return {
              content: [{ type: "text", text: "No Neovim instance selected" }],
              details: {
                action: params.action,
                result: null,
                cwd: ctx.cwd,
                error: "No instance selected",
              },
            };
          }

          const instance = instances.find((i) => i.lockfilePath === selected);
          if (!instance) {
            return {
              content: [{ type: "text", text: "Selected instance not found" }],
              details: {
                action: params.action,
                result: null,
                cwd: ctx.cwd,
                error: "Instance not found",
              },
            };
          }

          socket = instance.lockfile.socket;
          state.lockfile = instance.lockfilePath;
          state.socket = socket;
        }
      }

      // Use socket to query Neovim
      try {
        const result = await queryNvim(pi.exec, socket, params.action, {
          signal,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { action: params.action, result, cwd: ctx.cwd },
        };
      } catch (err) {
        // If query fails, clear stored socket so we rediscover next time
        state.socket = null;
        state.lockfile = null;

        const errorMsg = err instanceof Error ? err.message : String(err);
        let hint = "";
        if (errorMsg.includes("Timed out")) {
          hint =
            "\n\nHint: Neovim may be unresponsive. Check :PiNvimStatus in Neovim.";
        } else if (
          errorMsg.includes("ECONNREFUSED") ||
          errorMsg.includes("ENOENT")
        ) {
          hint =
            "\n\nHint: Neovim socket unavailable. Ensure Neovim is still running.";
        }

        return {
          content: [
            {
              type: "text",
              text: `Failed to query Neovim: ${errorMsg}${hint}`,
            },
          ],
          details: {
            action: params.action,
            result: null,
            cwd: ctx.cwd,
            error: errorMsg,
          },
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("nvim_context "));
      text += theme.fg("muted", args.action || "...");
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as NvimContextDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      // Error
      if (details.error) {
        return new Text(theme.fg("error", details.error), 0, 0);
      }

      const { action, result: nvimResult, cwd } = details;

      switch (action) {
        case "context": {
          const nvimCtx = nvimResult as NvimContext | null;
          if (!nvimCtx || !nvimCtx.file) {
            return new Text(theme.fg("dim", "No context available"), 0, 0);
          }

          const filePath = formatPath(nvimCtx.file, cwd);
          const line = nvimCtx.cursor?.line ?? 1;
          const col = nvimCtx.cursor?.col ?? 1;

          let text = theme.fg("accent", filePath);
          text += theme.fg("dim", `:${line}:${col}`);

          if (nvimCtx.filetype) {
            text += theme.fg("muted", ` (${nvimCtx.filetype})`);
          }

          if (expanded) {
            if (nvimCtx.selection) {
              const sel = nvimCtx.selection;
              text += `\n${theme.fg("muted", "Selection: ")}`;
              text += theme.fg(
                "dim",
                `${sel.start.line}:${sel.start.col} - ${sel.end.line}:${sel.end.col}`,
              );
            }
            if (nvimCtx.content) {
              text += `\n${theme.fg("muted", "Content:")}\n`;
              text += theme.fg("dim", nvimCtx.content);
            }
          }

          return new Text(text, 0, 0);
        }

        case "diagnostics": {
          const diags = nvimResult as DiagnosticsResult | null;
          if (!diags || diags.length === 0) {
            return new Text(theme.fg("success", "No diagnostics"), 0, 0);
          }

          const errors = diags.filter((d) => d.severity === 1).length;
          const warnings = diags.filter((d) => d.severity === 2).length;
          const others = diags.length - errors - warnings;

          let text = "";
          const parts: string[] = [];
          if (errors > 0)
            parts.push(
              theme.fg("error", `${errors} error${errors > 1 ? "s" : ""}`),
            );
          if (warnings > 0)
            parts.push(
              theme.fg(
                "warning",
                `${warnings} warning${warnings > 1 ? "s" : ""}`,
              ),
            );
          if (others > 0) parts.push(theme.fg("dim", `${others} other`));
          text = parts.join(", ");

          if (expanded) {
            for (const diag of diags) {
              const sev = severityLabel(diag.severity);
              const sevColor =
                diag.severity === 1
                  ? "error"
                  : diag.severity === 2
                    ? "warning"
                    : "dim";
              text += `\n${theme.fg("dim", `L${diag.lnum}:${diag.col}`)} `;
              text += theme.fg(sevColor, `[${sev}]`);
              text += ` ${theme.fg("muted", diag.message)}`;
              if (diag.source) {
                text += theme.fg("dim", ` (${diag.source})`);
              }
            }
          }

          return new Text(text, 0, 0);
        }

        case "current_function": {
          const fn = nvimResult as CurrentFunctionResult | null;
          if (!fn || !fn.name) {
            return new Text(theme.fg("dim", "No function at cursor"), 0, 0);
          }

          let text = theme.fg("accent", fn.name);
          if (fn.type) {
            text += theme.fg("muted", ` (${fn.type})`);
          }

          if (
            expanded &&
            fn.start_line !== undefined &&
            fn.end_line !== undefined
          ) {
            text += `\n${theme.fg("dim", `Lines ${fn.start_line}-${fn.end_line}`)}`;
          }

          return new Text(text, 0, 0);
        }

        case "splits": {
          const splits = nvimResult as SplitsResult | null;
          if (!splits || splits.length === 0) {
            return new Text(theme.fg("dim", "No visible splits"), 0, 0);
          }

          const focusedCount = splits.filter((s) => s.is_focused).length;
          let text = theme.fg(
            "accent",
            `${splits.length} split${splits.length > 1 ? "s" : ""}`,
          );
          if (focusedCount > 0) {
            text += theme.fg("dim", " (1 focused)");
          }

          if (expanded) {
            for (const split of splits) {
              const filePath = formatPath(split.file, cwd);
              const marker = split.is_focused ? theme.fg("accent", " *") : "";
              const modified = split.modified
                ? theme.fg("warning", " [+]")
                : "";
              text += `\n${theme.fg("muted", filePath)}${marker}${modified}`;
              text += theme.fg(
                "dim",
                ` L${split.visible_range.first}-${split.visible_range.last}`,
              );
              if (split.is_focused && split.cursor) {
                text += theme.fg(
                  "dim",
                  ` cursor ${split.cursor.line}:${split.cursor.col}`,
                );
              }
            }
          }

          return new Text(text, 0, 0);
        }

        default:
          return new Text(
            theme.fg("dim", JSON.stringify(nvimResult, null, 2)),
            0,
            0,
          );
      }
    },
  });
}
