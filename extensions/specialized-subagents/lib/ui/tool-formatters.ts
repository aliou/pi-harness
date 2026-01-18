import type { Theme } from "@mariozechner/pi-coding-agent";
import type { SubagentToolCall } from "../types";
import { getSpinnerFrame, INDICATOR } from "./spinner";

/**
 * Truncate string with ellipsis.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/**
 * Format tool call arguments as a compact string.
 */
function formatArgs(args: Record<string, unknown>, maxLength: number): string {
  if (!args || Object.keys(args).length === 0) return "";

  const keys = Object.keys(args);
  if (keys.length === 1) {
    const firstKey = keys[0];
    if (!firstKey) return "";
    const value = args[firstKey];
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return truncate(str, maxLength);
  }

  const pairs = keys.map((k) => {
    const v = args[k];
    const vStr = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}=${truncate(vStr, 20)}`;
  });

  return truncate(pairs.join(" "), maxLength);
}

/**
 * Format a tool call for collapsed display.
 *
 * Examples:
 * - "read: src/auth.ts"
 * - "bash: npm test"
 * - "grep: \"validateToken\" in src/"
 */
export function formatToolCallCompact(
  toolCall: SubagentToolCall,
  _theme: Theme,
): string {
  const argsStr = formatArgs(toolCall.args, 50);
  if (argsStr) {
    return `${toolCall.toolName}: ${argsStr}`;
  }
  return toolCall.toolName;
}

/**
 * Format a tool call for expanded display with status indicator.
 *
 * Examples:
 * - "⣋ read src/auth.ts"
 * - "✓ bash npm test"
 * - "✗ grep \"missing\" (file not found)"
 */
export function formatToolCallExpanded(
  toolCall: SubagentToolCall,
  spinnerFrame: number,
  _theme: Theme,
): string {
  const indicator =
    toolCall.status === "running"
      ? getSpinnerFrame(spinnerFrame)
      : toolCall.status === "done"
        ? INDICATOR.done
        : INDICATOR.error;

  const argsStr = formatArgs(toolCall.args, 50);
  let text = argsStr ? `${toolCall.toolName} ${argsStr}` : toolCall.toolName;

  if (toolCall.status === "error" && toolCall.error) {
    text += ` (${truncate(toolCall.error, 30)})`;
  }

  return `${indicator} ${text}`;
}

/**
 * Get the currently running tool call, or the last one if none running.
 */
export function getCurrentRunningTool(
  toolCalls: SubagentToolCall[],
): SubagentToolCall | undefined {
  if (toolCalls.length === 0) return undefined;

  // Find the last running tool
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const tool = toolCalls[i];
    if (tool && tool.status === "running") {
      return tool;
    }
  }

  // If none running, return the last tool
  return toolCalls[toolCalls.length - 1];
}
