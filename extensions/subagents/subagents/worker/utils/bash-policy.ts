/**
 * Worker bash policy checks.
 */

import { parse } from "@aliou/sh";
import { walkCommands, wordToString } from "./shell-utils";

const EXPLORATION_COMMANDS = new Set(["ls", "find", "grep", "rg", "tree"]);

const NO_VERIFY_PATTERN = /\b--no-verify\b/;
const EXPLORATION_PATTERN = /(^|[;&|()]\s*)(ls|find|grep|rg|tree)\b/;

export function getBashPolicyViolation(command: string): string | null {
  try {
    const { ast } = parse(command);

    let violation: string | null = null;
    walkCommands(ast, (cmd) => {
      const words = cmd.words ?? [];
      const commandName = words[0] ? wordToString(words[0]) : undefined;

      if (commandName && EXPLORATION_COMMANDS.has(commandName)) {
        violation = "Exploration commands are forbidden for worker bash usage.";
        return true;
      }

      for (const word of words) {
        const value = wordToString(word);
        if (value === "--no-verify" || value.startsWith("--no-verify=")) {
          violation = "'--no-verify' is forbidden by worker policy.";
          return true;
        }
      }

      return false;
    });

    return violation;
  } catch {
    if (NO_VERIFY_PATTERN.test(command)) {
      return "'--no-verify' is forbidden by worker policy.";
    }
    if (EXPLORATION_PATTERN.test(command)) {
      return "Exploration commands are forbidden for worker bash usage.";
    }
    return null;
  }
}
