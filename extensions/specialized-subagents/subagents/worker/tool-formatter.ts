/**
 * Tool call formatter for Worker subagent.
 */

import type { SubagentToolCall } from "../../lib/types";

/** Format a worker tool call for display */
export function formatWorkerToolCall(tc: SubagentToolCall): {
  label: string;
  detail: string;
} {
  const { toolName, args } = tc;

  switch (toolName) {
    case "read": {
      const path = args.path as string | undefined;
      return { label: "Read", detail: path ?? "..." };
    }
    case "edit": {
      const path = args.path as string | undefined;
      return { label: "Edit", detail: path ?? "..." };
    }
    case "write": {
      const path = args.path as string | undefined;
      return { label: "Write", detail: path ?? "..." };
    }
    case "bash": {
      const command = args.command as string | undefined;
      return { label: "Bash", detail: command ?? "..." };
    }
    default:
      return {
        label: toolName,
        detail: JSON.stringify(args).slice(0, 50),
      };
  }
}
