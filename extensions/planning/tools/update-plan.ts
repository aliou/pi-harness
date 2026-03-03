import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { parseFrontmatter, stringifyFrontmatter } from "../lib/frontmatter";
import { PLANS_DIR } from "../lib/plan-io";
import type { PlanStatus } from "../lib/types";

const UpdatePlanParams = Type.Object({
  filename: Type.String({
    description: "Plan filename returned by create_plan",
  }),
  status: Type.Union([
    Type.Literal("draft"),
    Type.Literal("pending"),
    Type.Literal("in-progress"),
    Type.Literal("completed"),
    Type.Literal("cancelled"),
    Type.Literal("abandoned"),
  ]),
  dependencies: Type.Array(Type.String()),
  dependents: Type.Array(Type.String()),
  plan: Type.String({
    description: "Full markdown plan body (no frontmatter)",
  }),
});

type UpdatePlanParamsType = Static<typeof UpdatePlanParams>;

interface UpdatePlanDetails {
  filename?: string;
  status?: PlanStatus;
  bytes?: number;
  error?: string;
}

export function setupUpdatePlanTool(pi: ExtensionAPI) {
  pi.registerTool<typeof UpdatePlanParams, UpdatePlanDetails>({
    name: "update_plan",
    label: "Update Plan",
    description:
      "Update a plan file frontmatter fields and replace the full plan body.",
    parameters: UpdatePlanParams,

    async execute(
      _toolCallId: string,
      params: UpdatePlanParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<UpdatePlanDetails>> {
      const filePath = path.join(ctx.cwd, PLANS_DIR, params.filename);
      const existing = await fs.readFile(filePath, "utf-8").catch(() => null);
      if (!existing) {
        return {
          content: [
            { type: "text", text: `Error: plan not found: ${params.filename}` },
          ],
          details: { error: "plan not found" },
        };
      }

      const parsed = parseFrontmatter(existing);
      if (!parsed) {
        return {
          content: [
            { type: "text", text: "Error: plan is missing frontmatter" },
          ],
          details: { error: "plan is missing frontmatter" },
        };
      }

      const frontmatter: Record<string, unknown> = {
        ...parsed,
        status: params.status,
        dependencies: params.dependencies,
        dependents: params.dependents,
      };

      const content = `${stringifyFrontmatter(frontmatter)}\n\n${params.plan.trim()}\n`;
      await fs.writeFile(filePath, content, "utf-8");

      return {
        content: [{ type: "text", text: `Updated plan: ${params.filename}` }],
        details: {
          filename: params.filename,
          status: params.status,
          bytes: Buffer.byteLength(content, "utf-8"),
        },
      };
    },

    renderCall(args: UpdatePlanParamsType, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Update Plan",
          mainArg: args.status,
          optionArgs: [{ label: "file", value: args.filename }],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<UpdatePlanDetails>,
      _options: ToolRenderResultOptions,
      _theme: Theme,
    ): Text {
      const text = result.content[0];
      return new Text(
        text?.type === "text" ? text.text : "update_plan done",
        0,
        0,
      );
    },
  });
}
