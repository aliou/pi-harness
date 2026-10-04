import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Execute a git command in a given working directory using pi.exec().
 *
 * Safer than child_process because pi.exec() goes through the same
 * sandboxing and audit layer as the main bash tool.
 */
export async function execGit(
  pi: ExtensionAPI,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<GitResult> {
  return pi.exec("git", args, { cwd, signal });
}
