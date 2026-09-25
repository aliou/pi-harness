import { existsSync } from "node:fs";
import path from "node:path";
import {
  createFindToolDefinition,
  type ExtensionAPI,
  type FindOperations,
} from "@earendil-works/pi-coding-agent";

interface GlobOptions {
  ignore: string[];
  limit: number;
}

/**
 * fd invocation that mirrors pi's built-in find tool behavior (glob matching,
 * gitignore handling, --full-path for path-containing patterns, result limit)
 * but runs through `pi.exec` instead of pi's readline-based stdout handling.
 * fd emits one short path per line and the output is bounded by --max-results,
 * so accumulation is safe here; the vulnerable default path is the one driven
 * by node:readline (see earendil-works/pi#8532).
 */
async function globWithExec(
  pi: ExtensionAPI,
  pattern: string,
  searchPath: string,
  options: GlobOptions,
): Promise<string[]> {
  const args: string[] = [
    "--glob",
    "--color=never",
    "--hidden",
    "--max-results",
    String(options.limit),
  ];

  // fd normally ignores .gitignore outside git repos, so keep --no-require-git
  // there. Inside repos, fd's default git-aware behavior stops parent
  // .gitignore rules at nested repo boundaries.
  let insideGitRepo = false;
  for (let current = searchPath; ; ) {
    if (existsSync(path.join(current, ".git"))) {
      insideGitRepo = true;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (!insideGitRepo) args.push("--no-require-git");

  // fd --glob matches against the basename unless --full-path is set.
  let effectivePattern = pattern;
  if (pattern.includes("/")) {
    args.push("--full-path");
    if (
      !pattern.startsWith("/") &&
      !pattern.startsWith("**/") &&
      pattern !== "**"
    ) {
      effectivePattern = `**/${pattern}`;
    }
  }
  args.push("--", effectivePattern, searchPath);

  const result = await pi.exec("fd", args, { cwd: searchPath });
  if (result.killed && result.code !== 0) {
    throw new Error(result.stderr || "fd was killed");
  }
  return result.stdout
    .split("\n")
    .map((line) => line.replace(/\r$/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Scout's find tool: pi's find tool definition (match/limit/truncation
 * semantics and renderers included) with a custom `glob` operation. Supplying
 * `glob` bypasses pi's fd+readline stdout path entirely.
 */
export function createScoutFindTool(pi: ExtensionAPI, cwd: string) {
  const operations: FindOperations = {
    exists: (p) => existsSync(p),
    glob: (pattern, searchPath, options) =>
      globWithExec(pi, pattern, searchPath, options),
  };
  // renderCall and renderResult are stripped: they carry typed parameters
  // that do not survive assignment into the generic SubagentToolSpec
  // ToolDefinition type, and subagent sessions render through the parent's
  // SubagentToolRenderer anyway.
  const definition = createFindToolDefinition(cwd, { operations });
  return { ...definition, renderCall: undefined, renderResult: undefined };
}
