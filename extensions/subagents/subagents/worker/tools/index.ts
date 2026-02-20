/**
 * Worker tool wrappers with scope and policy enforcement.
 */

import type { createReadOnlyTools } from "@mariozechner/pi-coding-agent";
import { resolveAllowedPaths } from "../utils/path-scope";
import { createGuardedBashTool } from "./guarded-bash";
import { createScopedEditTool } from "./scoped-edit";
import { createScopedReadTool } from "./scoped-read";
import { createScopedWriteTool } from "./scoped-write";

export type WorkerBuiltinTool = ReturnType<typeof createReadOnlyTools>[number];

export function createWorkerTools(
  cwd: string,
  files: string[],
): WorkerBuiltinTool[] {
  const allowedPaths = resolveAllowedPaths(cwd, files);

  const scopedReadTool: WorkerBuiltinTool = createScopedReadTool(
    cwd,
    files,
    allowedPaths,
  );
  const scopedEditTool: WorkerBuiltinTool = createScopedEditTool(
    cwd,
    files,
    allowedPaths,
  );
  const scopedWriteTool: WorkerBuiltinTool = createScopedWriteTool(
    cwd,
    files,
    allowedPaths,
  );
  const guardedBashTool: WorkerBuiltinTool = createGuardedBashTool(cwd);

  return [scopedReadTool, scopedEditTool, scopedWriteTool, guardedBashTool];
}
