import { createWriteTool } from "@mariozechner/pi-coding-agent";
import { isAllowedPath } from "../utils/path-scope";
import { blockedPathResult } from "../utils/results";

type WriteExecArgs = Parameters<ReturnType<typeof createWriteTool>["execute"]>;

export function createScopedWriteTool(
  cwd: string,
  files: string[],
  allowedPaths: Set<string>,
): ReturnType<typeof createWriteTool> {
  const writeTool = createWriteTool(cwd);

  return {
    ...writeTool,
    async execute(...execArgs: WriteExecArgs) {
      const [, args] = execArgs;
      const targetPath = (args as { path?: string }).path;
      if (!targetPath || !isAllowedPath(cwd, allowedPaths, targetPath)) {
        return blockedPathResult(targetPath ?? "(missing)", files);
      }
      return writeTool.execute(...execArgs);
    },
  };
}
