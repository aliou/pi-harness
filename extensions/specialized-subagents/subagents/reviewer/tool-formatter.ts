/**
 * Tool call formatter for Reviewer subagent.
 */

import { shortenPath } from "../../lib/paths";
import type { SubagentToolCall } from "../../lib/types";

/** Create a reviewer tool formatter with shortened path display */
export function createReviewerToolFormatter(
  cwd?: string,
): (tc: SubagentToolCall) => { label: string; detail: string } {
  const sp = (p: string) => shortenPath(p, cwd);

  return (tc: SubagentToolCall) => {
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
          detail: pattern
            ? `"${pattern}"${path ? ` in ${sp(path)}` : ""}`
            : "...",
        };
      }
      case "find": {
        const name = args.name as string | undefined;
        const path = args.path as string | undefined;
        return {
          label: "Find",
          detail: name ? `"${name}"${path ? ` in ${sp(path)}` : ""}` : "...",
        };
      }
      case "read": {
        const path = args.path as string | undefined;
        return {
          label: "Read",
          detail: path ? sp(path) : "...",
        };
      }
      case "ls": {
        const path = args.path as string | undefined;
        return {
          label: "List",
          detail: path ? sp(path) : ".",
        };
      }
      default:
        return {
          label: toolName,
          detail: JSON.stringify(args).slice(0, 50),
        };
    }
  };
}
