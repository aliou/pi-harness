/**
 * Tool call formatter for Reviewer subagent.
 */

import type { SubagentToolCall } from "../../lib/types";

/** Format a reviewer tool call for display */
export function formatReviewerToolCall(tc: SubagentToolCall): {
  label: string;
  detail: string;
} {
  const { toolName, args } = tc;

  switch (toolName) {
    case "bash": {
      const command = args.command as string | undefined;
      const truncated = command
        ? command.length > 60
          ? `${command.slice(0, 60)}...`
          : command
        : "...";
      return {
        label: "Bash",
        detail: truncated,
      };
    }
    case "grep": {
      const pattern = args.pattern as string | undefined;
      const path = args.path as string | undefined;
      return {
        label: "Grep",
        detail: pattern ? `"${pattern}"${path ? ` in ${path}` : ""}` : "...",
      };
    }
    case "find": {
      const name = args.name as string | undefined;
      const path = args.path as string | undefined;
      return {
        label: "Find",
        detail: name ? `"${name}"${path ? ` in ${path}` : ""}` : "...",
      };
    }
    case "read": {
      const path = args.path as string | undefined;
      return {
        label: "Read",
        detail: path ?? "...",
      };
    }
    case "ls": {
      const path = args.path as string | undefined;
      return {
        label: "List",
        detail: path ?? ".",
      };
    }
    default:
      return {
        label: toolName,
        detail: JSON.stringify(args).slice(0, 50),
      };
  }
}
