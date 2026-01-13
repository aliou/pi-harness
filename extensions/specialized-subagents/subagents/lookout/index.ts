/**
 * Lookout subagent - local codebase search by functionality or concept.
 *
 * Uses osgrep for semantic search combined with Pi's built-in tools
 * (grep, find, read, ls) for comprehensive code discovery.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import {
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
import { LOOKOUT_SYSTEM_PROMPT } from "./system-prompt";
import { formatLookoutToolCall } from "./tool-formatter";
import { createLookoutTools } from "./tools";
import type { LookoutDetails, LookoutInput } from "./types";

/** System prompt guidance for lookout tool usage */
export const LOOKOUT_GUIDANCE = `
## Lookout - Local Code Search

Use the \`lookout\` tool to find code by functionality or concept in the local codebase.

**When to use:**
- Locate code by behavior: "Where do we validate JWT tokens?"
- Find implementations: "Which module handles retry logic?"
- Understand code flow: "How does the auth flow work?"

**When NOT to use:**
- Known file path -> use \`read\` directly
- Simple exact string search -> use \`grep\` directly
- External/web research -> use \`scout\` instead

**Example:**
\`\`\`json
{ "query": "Where is the database connection pool configured?" }
\`\`\`
`;

const parameters = Type.Object({
  query: Type.String({
    description: "Search query describing what to find in the codebase",
  }),
});

/** Create the lookout tool definition for use in extensions */
export function createLookoutTool(): ToolDefinition<
  typeof parameters,
  LookoutDetails
> {
  return {
    name: "lookout",
    label: "Lookout",
    description: `Local codebase search by functionality or concept.

Uses semantic search (osgrep) + grep/find for comprehensive code discovery.
Returns relevant files with line ranges.

Example: { "query": "where do we handle authentication" }`,
    parameters,

    async execute(
      _toolCallId: string,
      args: LookoutInput,
      onUpdate: AgentToolUpdateCallback<LookoutDetails> | undefined,
      ctx: ExtensionContext,
      signal?: AbortSignal,
    ) {
      const { query } = args;

      // Validate: query is required
      if (!query) {
        const error = "Query is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            query: "",
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
              query,
              toolCalls: currentToolCalls,
              spinnerFrame,
            },
          });
        }
      }, 80);

      try {
        const model = resolveModel(MODEL, ctx);

        // Replace {cwd} in system prompt
        const systemPrompt = LOOKOUT_SYSTEM_PROMPT.replace("{cwd}", ctx.cwd);

        const result = await executeSubagent(
          {
            name: "lookout",
            model,
            systemPrompt,
            tools: createReadOnlyTools(ctx.cwd), // grep, find, read, ls
            customTools: createLookoutTools(), // semantic_search
            thinkingLevel: "off",
            logging: {
              enabled: true,
              debug: true,
            },
          },
          query,
          ctx,
          // onTextUpdate
          (_delta, accumulated) => {
            onUpdate?.({
              content: [{ type: "text", text: accumulated }],
              details: {
                query,
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
                query,
                toolCalls: currentToolCalls,
                spinnerFrame,
              },
            });
          },
        );

        if (result.aborted) {
          return {
            content: [{ type: "text" as const, text: "Aborted" }],
            details: {
              query,
              toolCalls: currentToolCalls,
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
              query,
              toolCalls: currentToolCalls,
              spinnerFrame,
              error: result.error,
              usage: result.usage,
            },
          };
        }

        // Check if all tool calls failed
        const errorCount = currentToolCalls.filter(
          (tc) => tc.status === "error",
        ).length;
        const allFailed =
          currentToolCalls.length > 0 && errorCount === currentToolCalls.length;

        if (allFailed) {
          const error = "All tool calls failed";
          return {
            content: [{ type: "text" as const, text: `Error: ${error}` }],
            details: {
              query,
              toolCalls: currentToolCalls,
              spinnerFrame,
              error,
              usage: result.usage,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            query,
            toolCalls: currentToolCalls,
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
          theme.fg("toolTitle", theme.bold("Lookout")) +
            theme.fg("muted", ` (${MODEL})`),
          0,
          0,
        ),
      );

      // Query
      if (args.query) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Query: ")}${args.query}`, 0, 0),
        );
      }

      return container;
    },

    renderResult(
      result: AgentToolResult<LookoutDetails>,
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
          // Show partialResult text if available (e.g., "Indexing...")
          const partialText = currentTool.partialResult?.content?.[0];
          if (partialText?.type === "text" && partialText.text) {
            return new Text(`${spinner} ${partialText.text}`, 0, 0);
          }
          const { label, detail } = formatLookoutToolCall(currentTool);
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

            // Show partialResult text if available for running tools
            let text: string;
            const partialText = tc.partialResult?.content?.[0];
            if (
              tc.status === "running" &&
              partialText?.type === "text" &&
              partialText.text
            ) {
              text = partialText.text;
            } else {
              const { label, detail } = formatLookoutToolCall(tc);
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
          (tc) => formatLookoutToolCall(tc).label,
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
          const { label, detail } = formatLookoutToolCall(tc);
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

/** Execute the lookout subagent directly (without tool wrapper) */
export async function executeLookout(
  input: LookoutInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<LookoutDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<LookoutDetails>> {
  const tool = createLookoutTool();
  return tool.execute("direct", input, onUpdate, ctx, signal);
}
