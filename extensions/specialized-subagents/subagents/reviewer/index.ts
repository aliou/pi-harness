/**
 * Reviewer subagent - code review feedback on diffs.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  Skill,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createReadOnlyTools,
  getMarkdownTheme,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import { Markdown, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  FailedToolCalls,
  MarkdownResponse,
  SubagentFooter,
  ToolCallList,
  ToolCallSummary,
  ToolDetails,
  type ToolDetailsField,
  ToolPreview,
  type ToolPreviewField,
} from "../../components";
import { executeSubagent, resolveModel, resolveSkillsByName } from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { MODEL } from "./config";
import { REVIEWER_SYSTEM_PROMPT } from "./system-prompt";
import { formatReviewerToolCall } from "./tool-formatter";
import { createReviewerTools } from "./tools";
import type { ReviewerDetails, ReviewerInput } from "./types";

/** System prompt guidance for reviewer tool usage */
export const REVIEWER_GUIDANCE = `
## Reviewer

Use reviewer for fast, high-signal code review feedback on diffs. It acts like a senior reviewer: calls out risks, correctness issues, test gaps, and maintainability concerns.

**Inputs:**
- \`diff\`: Freeform description of what to review (e.g., "staged changes", "last commit", "changes in src/auth/")
- \`focus\`: Optional focus area (security, performance, style, general)
- \`context\`: Optional description of the change intent

**Behavior:**
- Parse \`diff\` to determine the right git diff command
- Only flag issues introduced in the diff
- Avoid nitpicks unless style-only feedback requested

**Output format:**
Summary, Findings with [P0-P3], Verdict.
`;

const parameters = Type.Object({
  diff: Type.String({
    description:
      "Freeform description of what to review (e.g., staged changes, last commit, changes in src/auth/)",
  }),
  focus: Type.Optional(
    Type.String({
      description: "Focus area: security, performance, style, or general",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description: "What the change is trying to achieve",
    }),
  ),
  skills: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Skill names to provide specialized context (e.g., 'ios-26', 'drizzle-orm')",
    }),
  ),
});

/** Build the user message for the subagent based on inputs */
function buildUserMessage(input: ReviewerInput): string {
  const parts: string[] = [];

  parts.push(`Diff scope: ${input.diff}`);

  if (input.focus) {
    parts.push(`Focus: ${input.focus}`);
  }

  if (input.context) {
    parts.push(`Context: ${input.context}`);
  }

  return parts.join("\n");
}

/** Create the reviewer tool definition for use in extensions */
export function createReviewerTool(): ToolDefinition<
  typeof parameters,
  ReviewerDetails
> {
  return {
    name: "reviewer",
    label: "Reviewer",
    description: `Code review agent that analyzes diffs and returns structured feedback.

Inputs:
- diff: Freeform description of what to review (e.g., staged changes, last commit, changes in src/auth/)
- focus: Optional focus area (security, performance, style, general)
- context: Optional description of the change intent

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,

    parameters,

    async execute(
      _toolCallId: string,
      args: ReviewerInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<ReviewerDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const { diff, focus, context, skills: skillNames } = args;

      // Resolve skills if provided
      let resolvedSkills: Skill[] = [];
      let notFoundSkills: string[] = [];

      if (skillNames && skillNames.length > 0) {
        const result = resolveSkillsByName(skillNames, ctx.cwd);
        resolvedSkills = result.skills;
        notFoundSkills = result.notFound;
      }

      // Validate: diff is required
      if (!diff) {
        const error = "Diff scope is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            diff: "",
            focus,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            spinnerFrame: 0,
            error,
          },
        };
      }

      let resolvedModel: { provider: string; id: string } | undefined;

      let currentToolCalls: SubagentToolCall[] = [];
      let spinnerFrame = 0;

      // Set up spinner animation interval
      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        // Only update if we have running tool calls
        if (currentToolCalls.some((tc) => tc.status === "running")) {
          onUpdate?.({
            content: [{ type: "text", text: "" }],
            details: {
              diff,
              focus,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: currentToolCalls,
              spinnerFrame,
              resolvedModel,
            },
          });
        }
      }, 80);

      try {
        const model = resolveModel(MODEL, ctx);
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved provider/model as early as possible for footer rendering.
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            diff,
            focus,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: currentToolCalls,
            spinnerFrame,
            resolvedModel,
          },
        });

        let userMessage = buildUserMessage(args);

        // Append warning if skills not found
        if (notFoundSkills.length > 0) {
          userMessage += `\n\n**Note:** The following skills were not found and could not be loaded: ${notFoundSkills.join(", ")}`;
        }

        const bashTool = createBashTool(ctx.cwd) as ReturnType<
          typeof createReadOnlyTools
        >[number];
        const tools = [...createReadOnlyTools(ctx.cwd), bashTool];

        const result = await executeSubagent(
          {
            name: "reviewer",
            model,
            systemPrompt: REVIEWER_SYSTEM_PROMPT,
            skills: resolvedSkills,
            tools,
            customTools: createReviewerTools(),
            thinkingLevel: "low",
            logging: {
              enabled: true,
              debug: true,
            },
          },
          userMessage,
          ctx,
          // onTextUpdate
          (_delta, _accumulated) => {
            onUpdate?.({
              content: [{ type: "text", text: "" }],
              details: {
                diff,
                focus,
                context,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                spinnerFrame,
                resolvedModel,
              },
            });
          },
          signal,
          // onToolUpdate
          (toolCalls: SubagentToolCall[]) => {
            currentToolCalls = toolCalls;
            onUpdate?.({
              content: [{ type: "text", text: "" }],
              details: {
                diff,
                focus,
                context,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                spinnerFrame,
                resolvedModel,
              },
            });
          },
        );

        const finalToolCalls =
          result.toolCalls.length > 0 ? result.toolCalls : currentToolCalls;

        if (result.aborted) {
          return {
            content: [{ type: "text" as const, text: "Aborted" }],
            details: {
              diff,
              focus,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              spinnerFrame,
              aborted: true,
              usage: result.usage,
              resolvedModel,
            },
          };
        }

        if (result.error) {
          return {
            content: [
              { type: "text" as const, text: `Error: ${result.error}` },
            ],
            details: {
              diff,
              focus,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              spinnerFrame,
              error: result.error,
              usage: result.usage,
              resolvedModel,
            },
          };
        }

        // Check if all tool calls failed
        const errorCount = finalToolCalls.filter(
          (tc) => tc.status === "error",
        ).length;
        const allFailed =
          finalToolCalls.length > 0 && errorCount === finalToolCalls.length;

        if (allFailed) {
          const error = "All tool calls failed";
          return {
            content: [{ type: "text" as const, text: `Error: ${error}` }],
            details: {
              diff,
              focus,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              spinnerFrame,
              error,
              usage: result.usage,
              resolvedModel,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            diff,
            focus,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: finalToolCalls,
            spinnerFrame,
            response: result.content,
            usage: result.usage,
            resolvedModel,
          },
        };
      } finally {
        clearInterval(spinnerInterval);
      }
    },

    renderCall(args, theme) {
      const fields: ToolPreviewField[] = [{ label: "Diff", value: args.diff }];
      if (args.focus) fields.push({ label: "Focus", value: args.focus });
      if (args.context) fields.push({ label: "Context", value: args.context });
      if (args.skills?.length)
        fields.push({ label: "Skills", value: args.skills.join(", ") });
      return new ToolPreview({ title: "Reviewer", fields }, theme);
    },

    renderResult(
      result: AgentToolResult<ReviewerDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;

      // Fallback if details missing
      if (!details) {
        const text = result.content[0];
        const content = text?.type === "text" ? text.text : "";
        if (content) {
          try {
            const mdTheme = getMarkdownTheme();
            return new Markdown(content, 0, 0, mdTheme);
          } catch {
            return new Text(content, 0, 0);
          }
        }
        return new Text("", 0, 0);
      }

      const {
        toolCalls,
        spinnerFrame,
        response,
        aborted,
        error,
        usage,
        resolvedModel,
      } = details;

      const footer = new SubagentFooter(theme, {
        resolvedModel,
        usage,
        toolCalls,
      });

      // Build fields based on state
      const fields: ToolDetailsField[] = [];

      if (aborted) {
        fields.push({ label: "Status", value: "Aborted" });
      } else if (error) {
        fields.push({ label: "Error", value: error });
      } else if (response) {
        // Done state
        fields.push(
          new ToolCallSummary(toolCalls, formatReviewerToolCall, theme),
        );
        fields.push(
          new FailedToolCalls(toolCalls, formatReviewerToolCall, theme),
        );
        fields.push(new MarkdownResponse(response, theme));
      } else {
        // Running state
        fields.push(
          new ToolCallList(
            toolCalls,
            formatReviewerToolCall,
            theme,
            spinnerFrame,
          ),
        );
      }

      return new ToolDetails({ fields, footer }, options, theme);
    },
  };
}

/** Execute the reviewer subagent directly (without tool wrapper) */
export async function executeReviewer(
  input: ReviewerInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<ReviewerDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<ReviewerDetails>> {
  const tool = createReviewerTool();
  return tool.execute("direct", input, signal, onUpdate, ctx);
}
