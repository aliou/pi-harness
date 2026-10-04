import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const Params = Type.Object({
  args: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Arguments to pass to git diff, excluding the leading 'git diff'. Examples: ['--staged'], ['HEAD~1'], ['main...HEAD'], ['--', 'src/foo.ts'].",
    }),
  ),
});

export function createGitDiffTool(
  pi: ExtensionAPI,
  cwd: string,
): ToolDefinition<typeof Params> {
  return {
    name: "git_diff",
    label: "Git Diff",
    description:
      "Run git diff with the provided arguments. Pass only arguments after 'git diff'.",
    parameters: Params,
    async execute(_id, params, signal) {
      const args = ["diff", ...(params.args ?? [])];
      const result = await pi.exec("git", args, { cwd, signal });

      if (result.code !== 0) {
        const message = result.stderr.trim() || result.stdout.trim();
        throw new Error(`git ${args.join(" ")} failed: ${message}`);
      }

      return {
        content: [{ type: "text" as const, text: result.stdout.trimEnd() }],
        details: { args, cwd },
      };
    },
  };
}
