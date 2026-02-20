import { createEditTool } from "@mariozechner/pi-coding-agent";
import { isAllowedPath } from "../utils/path-scope";
import { blockedPathResult } from "../utils/results";

type EditExecArgs = Parameters<ReturnType<typeof createEditTool>["execute"]>;

export function createScopedEditTool(
  cwd: string,
  files: string[],
  allowedPaths: Set<string>,
): ReturnType<typeof createEditTool> {
  const editTool = createEditTool(cwd);

  return {
    ...editTool,
    async execute(...execArgs: EditExecArgs) {
      const [, args] = execArgs;
      const targetPath = (args as { path?: string }).path;
      if (!targetPath || !isAllowedPath(cwd, allowedPaths, targetPath)) {
        return blockedPathResult(targetPath ?? "(missing)", files);
      }
      return editTool.execute(...execArgs);
    },
  };
}
