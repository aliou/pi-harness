/**
 * Tool call formatter for Worker subagent.
 */

import { shortenPath } from "../../lib/paths";
import type { SubagentToolCall } from "../../lib/types";

/** Create a worker tool formatter with shortened path display */
export function createWorkerToolFormatter(
  cwd?: string,
): (tc: SubagentToolCall) => { label: string; detail: string } {
  const sp = (p: string) => shortenPath(p, cwd);

  return (tc: SubagentToolCall) => {
    const { toolName, args } = tc;

    switch (toolName) {
      case "read": {
        const path = args.path as string | undefined;
        return { label: "Read", detail: path ? sp(path) : "..." };
      }
      case "edit": {
        const path = args.path as string | undefined;
        return { label: "Edit", detail: path ? sp(path) : "..." };
      }
      case "write": {
        const path = args.path as string | undefined;
        return { label: "Write", detail: path ? sp(path) : "..." };
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
  };
}
