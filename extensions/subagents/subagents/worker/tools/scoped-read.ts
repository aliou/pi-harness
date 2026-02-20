import { createReadTool } from "@mariozechner/pi-coding-agent";
import { isAllowedPath } from "../utils/path-scope";
import { blockedPathResult } from "../utils/results";

type ReadExecArgs = Parameters<ReturnType<typeof createReadTool>["execute"]>;

export function createScopedReadTool(
  cwd: string,
  files: string[],
  allowedPaths: Set<string>,
): ReturnType<typeof createReadTool> {
  const readTool = createReadTool(cwd);

  return {
    ...readTool,
    async execute(...execArgs: ReadExecArgs) {
      const [, args] = execArgs;
      const targetPath = (args as { path?: string }).path;
      if (!targetPath || !isAllowedPath(cwd, allowedPaths, targetPath)) {
        return blockedPathResult(targetPath ?? "(missing)", files);
      }
      return readTool.execute(...execArgs);
    },
  };
}
