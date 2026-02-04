/**
 * Git Rebase Helper Hook
 *
 * Helps agents successfully run git rebase commands in non-interactive
 * contexts where no editor is available.
 *
 * When a git rebase command is detected that would hang (interactive rebase)
 * or open an editor (rebase --continue), this hook blocks the command and
 * provides guidance on the correct syntax.
 *
 * Uses AST-based matching via @aliou/sh to avoid false positives where
 * "git rebase" appears inside commit messages, grep patterns, or strings.
 */

import type {
  Assignment,
  Command,
  Program,
  SimpleCommand,
  Statement,
  Word,
  WordPart,
} from "@aliou/sh";
import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Patterns for fallback on parse failure
const GIT_REBASE_PATTERN = /git\s+rebase/i;
const REBASE_INTERACTIVE_PATTERN = /git\s+rebase\s+(-i|--interactive)/i;
const REBASE_CONTINUE_PATTERN = /git\s+rebase\s+--continue/i;

function wordToString(word: Word): string {
  return word.parts.map(partToString).join("");
}

function partToString(part: WordPart): string {
  switch (part.type) {
    case "Literal":
      return part.value;
    case "SglQuoted":
      return part.value;
    case "DblQuoted":
      return part.parts.map(partToString).join("");
    case "ParamExp":
      return part.short ? `$${part.param.value}` : `\${${part.param.value}}`;
    case "CmdSubst":
      return "$(...)";
    case "ArithExp":
      return `$((${part.expr}))`;
    case "ProcSubst":
      return `${part.op}(...)`;
  }
}

function walkCommands(
  node: Program,
  callback: (
    cmd: SimpleCommand,
    assignments: Assignment[],
  ) => boolean | undefined,
): void {
  for (const stmt of node.body) {
    if (walkStmt(stmt, callback)) return;
  }
}

function walkStmt(
  stmt: Statement,
  callback: (
    cmd: SimpleCommand,
    assignments: Assignment[],
  ) => boolean | undefined,
): boolean {
  return walkCmd(stmt.command, callback);
}

function walkCmd(
  cmd: Command,
  callback: (
    cmd: SimpleCommand,
    assignments: Assignment[],
  ) => boolean | undefined,
): boolean {
  switch (cmd.type) {
    case "SimpleCommand":
      return callback(cmd, cmd.assignments ?? []) === true;
    case "Pipeline":
      for (const s of cmd.commands) {
        if (walkStmt(s, callback)) return true;
      }
      return false;
    case "Logical":
      return walkStmt(cmd.left, callback) || walkStmt(cmd.right, callback);
    case "Subshell":
    case "Block":
      for (const s of cmd.body) {
        if (walkStmt(s, callback)) return true;
      }
      return false;
    case "IfClause":
      for (const s of [...cmd.cond, ...cmd.then, ...(cmd.else ?? [])]) {
        if (walkStmt(s, callback)) return true;
      }
      return false;
    case "ForClause":
    case "SelectClause":
    case "WhileClause":
      for (const s of [
        ...("cond" in cmd && cmd.cond ? cmd.cond : []),
        ...cmd.body,
      ]) {
        if (walkStmt(s, callback)) return true;
      }
      return false;
    case "CaseClause":
      for (const item of cmd.items) {
        for (const s of item.body) {
          if (walkStmt(s, callback)) return true;
        }
      }
      return false;
    case "FunctionDecl":
      for (const s of cmd.body) {
        if (walkStmt(s, callback)) return true;
      }
      return false;
    case "TimeClause":
      return walkStmt(cmd.command, callback);
    case "CoprocClause":
      return walkStmt(cmd.body, callback);
    case "CStyleLoop":
      for (const s of cmd.body) {
        if (walkStmt(s, callback)) return true;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Check if assignments include editor-related env vars.
 */
function hasEditorAssignment(assignments: Assignment[]): boolean {
  return assignments.some(
    (a) => a.name === "GIT_SEQUENCE_EDITOR" || a.name === "GIT_EDITOR",
  );
}

/**
 * Check if command string already has editor-related env vars or flags.
 */
function hasEditorConfiguration(command: string): boolean {
  return /GIT_SEQUENCE_EDITOR|GIT_EDITOR|core\.editor/.test(command);
}

export function setupGitRebaseHook(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, _ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input?.command as string | undefined;
    if (!command) return undefined;

    // Try AST-based detection
    try {
      const { ast } = parse(command);
      let result: { block: true; reason: string } | undefined;

      walkCommands(ast, (cmd, assignments) => {
        const words = (cmd.words ?? []).map(wordToString);
        if (words[0] !== "git" || words[1] !== "rebase") return;

        // Skip if already properly configured with editor env vars
        if (hasEditorAssignment(assignments)) return;

        const isInteractive =
          words.includes("-i") || words.includes("--interactive");
        const isContinue = words.includes("--continue");

        if (isInteractive) {
          result = {
            block: true,
            reason: `Interactive git rebase requires an editor, which is not available in this environment.

Use this instead:
  GIT_SEQUENCE_EDITOR=: GIT_EDITOR=true ${command}

The GIT_SEQUENCE_EDITOR=: sets the sequence editor to a no-op command (":" is a shell built-in that does nothing and exits successfully), which accepts the default rebase sequence without opening an editor.

If you need to modify the rebase sequence programmatically, create a script and use it as the GIT_SEQUENCE_EDITOR.`,
          };
          return true;
        }

        if (isContinue) {
          result = {
            block: true,
            reason: `git rebase --continue may open a commit message editor, which is not available in this environment.

Use one of these instead:
  GIT_EDITOR=true ${command}
  git -c core.editor=true ${command}
  git rebase --continue --no-edit

The --no-edit flag (Git 2.14+) keeps the original commit message without opening an editor.`,
          };
          return true;
        }

        // For other rebase commands (abort, skip, etc.)
        result = {
          block: true,
          reason: `git rebase commands may open an editor in this environment.

Use this instead:
  GIT_EDITOR=true ${command}

Or use git -c core.editor=true:
  git -c core.editor=true ${command}`,
        };
        return true;
      });

      return result;
    } catch {
      // Fallback to regex-based detection
      if (!GIT_REBASE_PATTERN.test(command)) return undefined;
      if (hasEditorConfiguration(command)) return undefined;

      if (REBASE_INTERACTIVE_PATTERN.test(command)) {
        return {
          block: true,
          reason: `Interactive git rebase requires an editor, which is not available in this environment.

Use this instead:
  GIT_SEQUENCE_EDITOR=: GIT_EDITOR=true ${command}

The GIT_SEQUENCE_EDITOR=: sets the sequence editor to a no-op command (":" is a shell built-in that does nothing and exits successfully), which accepts the default rebase sequence without opening an editor.

If you need to modify the rebase sequence programmatically, create a script and use it as the GIT_SEQUENCE_EDITOR.`,
        };
      }

      if (REBASE_CONTINUE_PATTERN.test(command)) {
        return {
          block: true,
          reason: `git rebase --continue may open a commit message editor, which is not available in this environment.

Use one of these instead:
  GIT_EDITOR=true ${command}
  git -c core.editor=true ${command}
  git rebase --continue --no-edit

The --no-edit flag (Git 2.14+) keeps the original commit message without opening an editor.`,
        };
      }

      return {
        block: true,
        reason: `git rebase commands may open an editor in this environment.

Use this instead:
  GIT_EDITOR=true ${command}

Or use git -c core.editor=true:
  git -c core.editor=true ${command}`,
      };
    }
  });
}
