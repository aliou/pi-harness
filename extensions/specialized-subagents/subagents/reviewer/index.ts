/**
 * Reviewer subagent - code review feedback on diffs.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createReadOnlyTools,
  getMarkdownTheme,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { executeSubagent, resolveModel } from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { getSpinnerFrame, INDICATOR } from "../../lib/ui/spinner";
import { formatSubagentStats, pluralize } from "../../lib/ui/stats";
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
- context: Optional description of the change intent`,

    parameters,

    async execute(
      _toolCallId: string,
      args: ReviewerInput,
      onUpdate: AgentToolUpdateCallback<ReviewerDetails> | undefined,
      ctx: ExtensionContext,
      signal?: AbortSignal,
    ) {
      const { diff, focus, context } = args;

      // Validate: diff is required
      if (!diff) {
        const error = "Diff scope is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            diff: "",
            focus,
            context,
            toolCalls: [],
            spinnerFrame: 0,
            error,
          },
        };
      }

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
              toolCalls: currentToolCalls,
              spinnerFrame,
            },
          });
        }
      }, 80);

      try {
        const model = resolveModel(MODEL, ctx);
        const userMessage = buildUserMessage(args);

        const bashTool = createBashTool(ctx.cwd) as ReturnType<
          typeof createReadOnlyTools
        >[number];
        const tools = [...createReadOnlyTools(ctx.cwd), bashTool];

        const result = await executeSubagent(
          {
            name: "reviewer",
            model,
            systemPrompt: REVIEWER_SYSTEM_PROMPT,
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
          (_delta, accumulated) => {
            onUpdate?.({
              content: [{ type: "text", text: accumulated }],
              details: {
                diff,
                focus,
                context,
                toolCalls: currentToolCalls,
                spinnerFrame,
                response: accumulated,
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
                toolCalls: currentToolCalls,
                spinnerFrame,
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
              toolCalls: finalToolCalls,
              spinnerFrame,
              aborted: true,
              usage: result.usage,
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
              toolCalls: finalToolCalls,
              spinnerFrame,
              error: result.error,
              usage: result.usage,
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
              toolCalls: finalToolCalls,
              spinnerFrame,
              error,
              usage: result.usage,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            diff,
            focus,
            context,
            toolCalls: finalToolCalls,
            spinnerFrame,
            response: result.content,
            usage: result.usage,
          },
        };
      } finally {
        clearInterval(spinnerInterval);
      }
    },

    renderCall(args, theme) {
      const container = new Container();

      // Title with model name
      container.addChild(
        new Text(
          theme.fg("toolTitle", theme.bold("Reviewer")) +
            theme.fg("muted", ` (${MODEL})`),
          0,
          0,
        ),
      );

      // Diff scope preview
      if (args.diff) {
        const maxLen = 80;
        const preview =
          args.diff.length > maxLen
            ? `${args.diff.slice(0, maxLen)}...`
            : args.diff;
        container.addChild(
          new Text(`  ${theme.fg("muted", "Diff: ")}${preview}`, 0, 0),
        );
      }

      // Focus (if provided)
      if (args.focus) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Focus: ")}${args.focus}`, 0, 0),
        );
      }

      // Context (if provided)
      if (args.context) {
        const maxLen = 80;
        const preview =
          args.context.length > maxLen
            ? `${args.context.slice(0, maxLen)}...`
            : args.context;
        container.addChild(
          new Text(`  ${theme.fg("muted", "Context: ")}${preview}`, 0, 0),
        );
      }

      return container;
    },

    renderResult(
      result: AgentToolResult<ReviewerDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;
      const { expanded, isPartial } = options;

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

      const { toolCalls, spinnerFrame, response, aborted, error, usage } =
        details;

      // Counts
      const doneCount = toolCalls.filter((tc) => tc.status === "done").length;
      const runningCount = toolCalls.filter(
        (tc) => tc.status === "running",
      ).length;
      const errorCount = toolCalls.filter((tc) => tc.status === "error").length;

      // Aborted state
      if (aborted) {
        const suffix =
          doneCount > 0
            ? ` (${doneCount} ${pluralize(doneCount, "tool call")} completed)`
            : "";
        return new Text(
          theme.fg("warning", "Aborted") + theme.fg("muted", suffix),
          0,
          0,
        );
      }

      // Error state
      if (error) {
        return new Text(theme.fg("error", `Error: ${error}`), 0, 0);
      }

      // Running + collapsed: show current tool
      if (isPartial && !expanded) {
        const currentTool = toolCalls.find((tc) => tc.status === "running");
        if (currentTool) {
          const spinner = getSpinnerFrame(spinnerFrame);
          const partialText = currentTool.partialResult?.content?.[0];
          if (partialText?.type === "text" && partialText.text) {
            return new Text(`${spinner} ${partialText.text}`, 0, 0);
          }
          const { label, detail } = formatReviewerToolCall(currentTool);
          const text = detail ? `${label} ${detail}` : label;
          return new Text(`${spinner} ${text}`, 0, 0);
        }
        return new Text(
          theme.fg("muted", `${getSpinnerFrame(spinnerFrame)} thinking...`),
          0,
          0,
        );
      }

      // Running + expanded: show all tool calls
      if (isPartial) {
        const container = new Container();

        // Status line
        const statusText =
          runningCount > 0
            ? `${doneCount} done, ${runningCount} running`
            : "Working...";
        container.addChild(new Text(theme.fg("muted", statusText), 0, 0));

        // Tool calls
        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            const indicator =
              tc.status === "running"
                ? getSpinnerFrame(spinnerFrame)
                : tc.status === "done"
                  ? INDICATOR.done
                  : INDICATOR.error;

            const indicatorColored =
              tc.status === "done"
                ? theme.fg("success", indicator)
                : tc.status === "error"
                  ? theme.fg("error", indicator)
                  : indicator;

            let text: string;
            const partialText = tc.partialResult?.content?.[0];
            if (
              tc.status === "running" &&
              partialText?.type === "text" &&
              partialText.text
            ) {
              text = partialText.text;
            } else {
              const { label, detail } = formatReviewerToolCall(tc);
              text = detail
                ? `${theme.bold(label)} ${detail}`
                : theme.bold(label);
            }
            container.addChild(new Text(`${indicatorColored} ${text}`, 0, 0));
          }
        }

        return container;
      }

      // Done + collapsed
      if (!expanded) {
        const allFailed =
          toolCalls.length > 0 && errorCount === toolCalls.length;
        const stats = formatSubagentStats(
          usage ?? { estimatedTokens: Math.round((response?.length ?? 0) / 4) },
          toolCalls.length,
        );
        const indicator = allFailed ? INDICATOR.error : INDICATOR.done;
        const indicatorColor = allFailed ? "error" : "success";
        return new Text(
          theme.fg(indicatorColor, `${indicator} `) + theme.fg("muted", stats),
          0,
          0,
        );
      }

      // Done + expanded
      const container = new Container();

      // Stats line
      const allFailed = toolCalls.length > 0 && errorCount === toolCalls.length;
      const stats = formatSubagentStats(
        usage ?? { estimatedTokens: Math.round((response?.length ?? 0) / 4) },
        toolCalls.length,
      );
      const indicator = allFailed ? INDICATOR.error : INDICATOR.done;
      const indicatorColor = allFailed ? "error" : "success";
      container.addChild(
        new Text(
          theme.fg(indicatorColor, `${indicator} `) + theme.fg("muted", stats),
          0,
          0,
        ),
      );

      // Tool calls summary
      if (toolCalls.length > 0) {
        const toolNames = toolCalls.map(
          (tc) => formatReviewerToolCall(tc).label,
        );
        const counts: Record<string, number> = {};
        for (const name of toolNames) {
          counts[name] = (counts[name] || 0) + 1;
        }
        const summary = Object.entries(counts)
          .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
          .join(", ");

        container.addChild(
          new Text(
            theme.fg(
              "muted",
              `${toolCalls.length} ${pluralize(toolCalls.length, "tool call")}: `,
            ) + summary,
            0,
            0,
          ),
        );

        // Show failed tool calls with details
        const failedCalls = toolCalls.filter((tc) => tc.status === "error");
        for (const tc of failedCalls) {
          const { label, detail } = formatReviewerToolCall(tc);
          const text = detail
            ? `${theme.bold(label)} ${detail}`
            : theme.bold(label);
          container.addChild(
            new Text(`${theme.fg("error", INDICATOR.error)} ${text}`, 0, 0),
          );
        }
      }

      // Response as markdown
      if (response) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "───"), 0, 0));
        container.addChild(new Spacer(1));

        try {
          const mdTheme = getMarkdownTheme();
          container.addChild(new Markdown(response, 0, 0, mdTheme));
        } catch {
          container.addChild(new Text(response, 0, 0));
        }

        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", stats), 0, 0));
      }

      return container;
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
  return tool.execute("direct", input, onUpdate, ctx, signal);
}
