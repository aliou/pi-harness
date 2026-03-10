import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Override the built-in bash tool to add a cwd parameter.
 *
 * Models often use `cd dir && command` which silently skips the command
 * if the directory doesn't exist. The cwd parameter is passed to spawn()
 * which fails explicitly if the directory is missing.
 */
export function setupBashTool(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const nativeBash = createBashTool(cwd);

  const schema = Type.Object({
    command: Type.String({ description: "Bash command to execute" }),
    timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
    cwd: Type.Optional(
      Type.String({
        description: "Working directory. Use instead of 'cd dir && command'.",
      }),
    ),
  });

  pi.registerTool({
    ...nativeBash,
    parameters: schema,
    // TODO: promptGuidelines not recognized by current pi-coding-agent types
    // promptGuidelines: [
    //   "Use the cwd parameter instead of 'cd dir && command'.",
    // ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const effectiveCwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
      const bashForCwd = createBashTool(effectiveCwd);
      return bashForCwd.execute(
        toolCallId,
        { command: params.command, timeout: params.timeout },
        signal,
        onUpdate,
      );
    },
  });
}
