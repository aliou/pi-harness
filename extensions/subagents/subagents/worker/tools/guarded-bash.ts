import { createBashTool } from "@mariozechner/pi-coding-agent";
import { getBashPolicyViolation } from "../utils/bash-policy";
import { blockedCommandResult } from "../utils/results";

type BashExecArgs = Parameters<ReturnType<typeof createBashTool>["execute"]>;

export function createGuardedBashTool(
  cwd: string,
): ReturnType<typeof createBashTool> {
  const bashTool = createBashTool(cwd);

  return {
    ...bashTool,
    async execute(...execArgs: BashExecArgs) {
      const [, args] = execArgs;
      const command = ((args as { command?: string }).command ?? "").trim();

      const violation = getBashPolicyViolation(command);
      if (violation) {
        return blockedCommandResult(violation, command);
      }

      return bashTool.execute(...execArgs);
    },
  };
}
