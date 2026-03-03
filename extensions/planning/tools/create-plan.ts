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
import { stringifyFrontmatter } from "../lib/frontmatter";
import { PLANS_DIR } from "../lib/plan-io";

const CreatePlanParams = Type.Object({
  title: Type.String({ description: "Human-readable plan title" }),
  dependencies: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional plan slugs this plan depends on",
    }),
  ),
  dependents: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional plan slugs that depend on this plan",
    }),
  ),
  overwrite: Type.Optional(
    Type.Boolean({ description: "Overwrite if same dated filename exists" }),
  ),
});

type CreatePlanParamsType = Static<typeof CreatePlanParams>;

interface CreatePlanDetails {
  filename?: string;
  slug?: string;
  instructions?: string;
  error?: string;
}

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function detectProjectName(cwd: string): Promise<string | undefined> {
  const agentsPath = path.join(cwd, "AGENTS.md");
  try {
    const content = await fs.readFile(agentsPath, "utf-8");
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading;
  } catch {
    // ignore
  }

  const dir = path.basename(cwd);
  return dir || undefined;
}

export function setupCreatePlanTool(pi: ExtensionAPI) {
  pi.registerTool<typeof CreatePlanParams, CreatePlanDetails>({
    name: "create_plan",
    label: "Create Plan",
    description:
      "Create an empty plan file with deduced frontmatter and return instructions for next step.",
    parameters: CreatePlanParams,

    async execute(
      _toolCallId: string,
      params: CreatePlanParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<CreatePlanDetails>> {
      const date = new Date().toISOString().split("T")[0] ?? "";
      const slug = titleToSlug(params.title);

      if (!slug) {
        return {
          content: [{ type: "text", text: "Error: title produced empty slug" }],
          details: { error: "title produced empty slug" },
        };
      }

      const filename = `${date}-${slug}.md`;
      const plansPath = path.join(ctx.cwd, PLANS_DIR);
      const filePath = path.join(plansPath, filename);
      const overwrite = params.overwrite ?? false;

      await fs.mkdir(plansPath, { recursive: true });

      try {
        await fs.access(filePath);
        if (!overwrite) {
          return {
            content: [
              {
                type: "text",
                text: `Error: plan already exists: ${filename}. Set overwrite=true to replace it.`,
              },
            ],
            details: { error: "plan already exists; set overwrite=true" },
          };
        }
      } catch {
        // does not exist
      }

      const projectName = await detectProjectName(ctx.cwd);
      const directoryName = path.basename(ctx.cwd);

      const frontmatter: Record<string, unknown> = {
        date,
        title: params.title,
        directory: ctx.cwd,
        status: "draft",
        dependencies: params.dependencies ?? [],
        dependents: params.dependents ?? [],
      };

      if (projectName && projectName !== directoryName) {
        frontmatter.project = projectName;
      }

      const content = `${stringifyFrontmatter(frontmatter)}\n\n# ${params.title}\n\n`;
      await fs.writeFile(filePath, content, "utf-8");

      const instructions = [
        `Plan scaffold created: ${filename}.`,
        "Now write the full implementation plan body and call update_plan.",
        `Call update_plan with: filename="${filename}", status="pending" (or current status), dependencies, dependents, and full plan markdown in plan.`,
      ].join("\n");

      return {
        content: [{ type: "text", text: instructions }],
        details: {
          filename,
          slug,
          instructions,
        },
      };
    },

    renderCall(args: CreatePlanParamsType, theme: Theme) {
      return new ToolCallHeader(
        { toolName: "Create Plan", mainArg: args.title },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<CreatePlanDetails>,
      _options: ToolRenderResultOptions,
      _theme: Theme,
    ): Text {
      const text = result.content[0];
      return new Text(
        text?.type === "text" ? text.text : "create_plan done",
        0,
        0,
      );
    },
  });
}
