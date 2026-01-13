/**
 * Tool call formatter for Lookout subagent.
 */

import type { SubagentToolCall } from "../../lib/types";

/** Format a lookout tool call for display */
export function formatLookoutToolCall(tc: SubagentToolCall): {
  label: string;
  detail: string;
} {
  const { toolName, args } = tc;

  switch (toolName) {
    case "semantic_search": {
      const query = args.query as string | undefined;
      const truncated = query
        ? `"${query.slice(0, 50)}${query.length > 50 ? "..." : ""}"`
        : "...";
      return {
        label: "Semantic",
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
