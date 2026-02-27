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
import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
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
    text: string;
  };
  filetype: string;
  modified: boolean;
}

interface DiagnosticItem {
  line: number;
  col: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
}

type DiagnosticsResult = DiagnosticItem[];

interface CurrentFunctionResult {
  name: string;
  type: "function" | "method" | "class" | "module";
  start_line: number;
  end_line: number;
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
 * Map severity string to a theme color name.
 */
function severityColor(
  severity: DiagnosticItem["severity"],
): "error" | "warning" | "dim" {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    default:
      return "dim";
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
      return new ToolCallHeader(
        {
          toolName: "Neovim Context",
          action: args.action || "...",
        },
        theme,
      );
    },

    renderResult(result, options, theme) {
      const details = result.details as NvimContextDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const { action, result: nvimResult, cwd } = details;
      let content = "";

      if (details.error) {
        content = theme.fg("error", details.error);
      } else {
        switch (action) {
          case "context": {
            const nvimCtx = nvimResult as NvimContext | null;
            if (!nvimCtx || !nvimCtx.file) {
              content = theme.fg("dim", "No context available");
              break;
            }

            const filePath = formatPath(nvimCtx.file, cwd);
            const line = nvimCtx.cursor?.line ?? 1;
            const col = nvimCtx.cursor?.col ?? 1;

            content =
              theme.fg("accent", filePath) + theme.fg("dim", `:${line}:${col}`);
            if (nvimCtx.filetype) {
              content += theme.fg("muted", ` (${nvimCtx.filetype})`);
            }

            if (options.expanded && nvimCtx.selection) {
              const sel = nvimCtx.selection;
              content += `\n${theme.fg("muted", "Selection: ")}`;
              content += theme.fg(
                "dim",
                `${sel.start.line}:${sel.start.col} - ${sel.end.line}:${sel.end.col}`,
              );
              if (sel.text) {
                content += `\n${theme.fg("dim", sel.text)}`;
              }
            }
            break;
          }

          case "diagnostics": {
            const diags = nvimResult as DiagnosticsResult | null;
            if (!diags || diags.length === 0) {
              content = theme.fg("success", "No diagnostics");
              break;
            }

            const errors = diags.filter(
              (diag) => diag.severity === "error",
            ).length;
            const warnings = diags.filter(
              (diag) => diag.severity === "warning",
            ).length;
            const others = diags.length - errors - warnings;

            const parts: string[] = [];
            if (errors > 0) {
              parts.push(
                theme.fg("error", `${errors} error${errors > 1 ? "s" : ""}`),
              );
            }
            if (warnings > 0) {
              parts.push(
                theme.fg(
                  "warning",
                  `${warnings} warning${warnings > 1 ? "s" : ""}`,
                ),
              );
            }
            if (others > 0) {
              parts.push(theme.fg("dim", `${others} other`));
            }
            content = parts.join(", ");

            if (options.expanded) {
              for (const diag of diags) {
                content += `\n${theme.fg("dim", `L${diag.line}:${diag.col}`)} `;
                content += theme.fg(
                  severityColor(diag.severity),
                  `[${diag.severity}]`,
                );
                content += ` ${theme.fg("muted", diag.message)}`;
                if (diag.source) {
                  content += theme.fg("dim", ` (${diag.source})`);
                }
              }
            }
            break;
          }

          case "current_function": {
            const fn = nvimResult as CurrentFunctionResult | null;
            if (!fn || !fn.name) {
              content = theme.fg("dim", "No function at cursor");
              break;
            }

            content =
              theme.fg("accent", fn.name) + theme.fg("muted", ` (${fn.type})`);
            if (options.expanded) {
              content += `\n${theme.fg("dim", `Lines ${fn.start_line}-${fn.end_line}`)}`;
            }
            break;
          }

          case "splits": {
            const splits = nvimResult as SplitsResult | null;
            if (!splits || splits.length === 0) {
              content = theme.fg("dim", "No visible splits");
              break;
            }

            const focusedCount = splits.filter(
              (split) => split.is_focused,
            ).length;
            content = theme.fg(
              "accent",
              `${splits.length} split${splits.length > 1 ? "s" : ""}`,
            );
            if (focusedCount > 0) {
              content += theme.fg("dim", " (1 focused)");
            }

            if (options.expanded) {
              for (const split of splits) {
                const filePath = formatPath(split.file, cwd);
                const marker = split.is_focused ? theme.fg("accent", " *") : "";
                const modified = split.modified
                  ? theme.fg("warning", " [+]")
                  : "";
                content += `\n${theme.fg("muted", filePath)}${marker}${modified}`;
                content += theme.fg(
                  "dim",
                  ` L${split.visible_range.first}-${split.visible_range.last}`,
                );
                if (split.is_focused && split.cursor) {
                  content += theme.fg(
                    "dim",
                    ` cursor ${split.cursor.line}:${split.cursor.col}`,
                  );
                }
              }
            }
            break;
          }

          default:
            content = theme.fg("dim", JSON.stringify(nvimResult, null, 2));
        }
      }

      return new ToolBody(
        {
          fields: [new Text(content, 0, 0)],
          footer: new ToolFooter(theme, {
            items: [
              { label: "action", value: action, tone: "accent" },
              {
                label: "status",
                value: details.error ? "error" : "ok",
                tone: details.error ? "error" : "success",
              },
            ],
          }),
        },
        options,
        theme,
      );
    },
  });
}
