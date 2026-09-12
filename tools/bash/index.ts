import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { collapseHomePath, expandHomePath } from "@harness/utils/path";
import { Type } from "typebox";

/**
 * Override the built-in bash tool to add a cwd parameter.
 *
 * Models often use `cd dir && command` which silently skips the command
 * if the directory doesn't exist. The cwd parameter is passed to spawn()
 * which fails explicitly if the directory is missing.
 */
export default function (pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const nativeBash = createBashToolDefinition(cwd);

  const schema = Type.Object({
    command: Type.String({ description: "Bash command to execute" }),
    timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
    cwd: Type.Optional(
      Type.String({
        description:
          "Working directory for the command. Prefer this over shell wrappers like 'cd dir && command', 'pushd', or 'cd ../..; ...'.",
      }),
    ),
  });

  pi.registerTool({
    ...nativeBash,
    parameters: schema,
    promptGuidelines: [
      "bash: When a command should run in another directory, set cwd and keep command free of leading 'cd', 'pushd', or similar directory-changing shell wrappers.",
      "bash: Do not use patterns like 'cd dir && command', 'cd dir; command', or 'pushd dir && command'.",
      "bash: Use the cwd parameter instead of 'cd dir && command'.",
      "bash: Reserve bash for git, build/test, package managers, ssh, curl, and process management.",
      "bash: Prefer native tools like read, find, grep, edit, and write over shell commands when available.",
    ],
    renderCall(args, theme, context) {
      const state = context.state as {
        startedAt?: number;
        endedAt?: number;
        interval?: NodeJS.Timeout;
      };
      if (context.executionStarted && state.startedAt === undefined) {
        state.startedAt = Date.now();
        state.endedAt = undefined;
      }

      const command = args.command ?? "";
      const timeout = args.timeout as number | undefined;
      const cwdArg = args.cwd as string | undefined;

      const commandDisplay = command ? command : theme.fg("toolOutput", "...");
      const cwdDisplay = cwdArg ? collapseHomePath(cwdArg) : cwdArg;
      const cwdSuffix = cwdDisplay
        ? theme.fg("muted", ` (cwd: ${cwdDisplay})`)
        : "";
      const timeoutSuffix = timeout
        ? theme.fg("muted", ` (timeout ${timeout}s)`)
        : "";

      const text =
        (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText(
        `${theme.fg("toolTitle", theme.bold(`$ ${commandDisplay}`))}${cwdSuffix}${timeoutSuffix}`,
      );
      return text;
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const cwdArg = params.cwd ? expandHomePath(params.cwd) : undefined;
      const effectiveCwd = cwdArg ? resolve(ctx.cwd, cwdArg) : ctx.cwd;
      // Pi resolves the spawn directory from ctx.cwd and only falls back to
      // the cwd captured at definition time, so the per-call directory has to
      // travel on the context.
      return nativeBash.execute(
        toolCallId,
        { command: params.command, timeout: params.timeout },
        signal,
        onUpdate,
        { ...ctx, cwd: effectiveCwd },
      );
    },
  });
}
