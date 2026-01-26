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
  Skill,
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
import { SubagentFooter } from "../../components";
import {
  detectModelFamily,
  executeSubagent,
  resolveModel,
  resolveSkillsByName,
} from "../../lib";
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
- Known file path or existing doc/plan -> use \`read\` directly
- Simple exact string search -> use \`grep\` directly
- Planning, strategy, or request for an implementation plan -> use \`oracle\`
- External/web research -> use \`scout\` instead

**Example:**
\`\`\`json
{ "query": "Where is the database connection pool configured?" }
\`\`\`

**Custom directory:** Pass \`cwd\` to search a specific directory instead of the current project:
\`\`\`json
{ "query": "auth implementation", "cwd": "/path/to/other/project" }
\`\`\`
`;

const parameters = Type.Object({
  query: Type.String({
    description: "Search query describing what to find in the codebase",
  }),
  cwd: Type.Optional(
    Type.String({
      description:
        "Working directory to search in (defaults to current project directory)",
    }),
  ),
  skills: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Skill names to provide specialized context (e.g., 'ios-26', 'drizzle-orm')",
    }),
  ),
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

Example: { "query": "where do we handle authentication" }

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,
    parameters,

    async execute(
      _toolCallId: string,
      args: LookoutInput,
      onUpdate: AgentToolUpdateCallback<LookoutDetails> | undefined,
      ctx: ExtensionContext,
      signal?: AbortSignal,
    ) {
      const { query, cwd: customCwd, skills: skillNames } = args;

      // Resolve skills if provided
      let resolvedSkills: Skill[] = [];
      let notFoundSkills: string[] = [];

      if (skillNames && skillNames.length > 0) {
        const result = resolveSkillsByName(skillNames, ctx.cwd);
        resolvedSkills = result.skills;
        notFoundSkills = result.notFound;
      }

      // Validate: query is required
      if (!query) {
        const error = "Query is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            query: "",
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

      // Use custom cwd if provided, otherwise use context cwd
      const workingDir = customCwd ?? ctx.cwd;

      const familyUnknown = detectModelFamily(MODEL) === "unknown";
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
              query,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: currentToolCalls,
              spinnerFrame,
              resolvedModel,
              familyUnknown,
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
            query,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: currentToolCalls,
            spinnerFrame,
            resolvedModel,
            familyUnknown,
          },
        });

        // Replace {cwd} in system prompt with working directory
        const systemPrompt = LOOKOUT_SYSTEM_PROMPT.replace("{cwd}", workingDir);

        let userMessage = query;

        // Append warning if skills not found
        if (notFoundSkills.length > 0) {
          userMessage += `\n\n**Note:** The following skills were not found and could not be loaded: ${notFoundSkills.join(", ")}`;
        }

        const result = await executeSubagent(
          {
            name: "lookout",
            model,
            systemPrompt,
            skills: resolvedSkills,
            tools: createReadOnlyTools(workingDir), // grep, find, read, ls
            customTools: createLookoutTools(workingDir), // semantic_search
            thinkingLevel: "off",
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
                query,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                spinnerFrame,
                response: accumulated,
                resolvedModel,
                familyUnknown,
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
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                spinnerFrame,
                resolvedModel,
                familyUnknown,
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
              query,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              spinnerFrame,
              aborted: true,
              usage: result.usage,
              resolvedModel,
              familyUnknown,
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
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              spinnerFrame,
              error: result.error,
              usage: result.usage,
              resolvedModel,
              familyUnknown,
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
              query,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              spinnerFrame,
              error,
              usage: result.usage,
              resolvedModel,
              familyUnknown,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            query,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: finalToolCalls,
            spinnerFrame,
            response: result.content,
            usage: result.usage,
            resolvedModel,
            familyUnknown,
          },
        };
      } finally {
        clearInterval(spinnerInterval);
      }
    },

    renderCall(args, theme) {
      const container = new Container();

      container.addChild(
        new Text(theme.fg("toolTitle", theme.bold("Lookout")), 0, 0),
      );

      // Query
      if (args.query) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Query: ")}${args.query}`, 0, 0),
        );
      }

      // Custom working directory
      if (args.cwd) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Directory: ")}${args.cwd}`, 0, 0),
        );
      }

      // Show skills if provided
      if (args.skills && args.skills.length > 0) {
        container.addChild(
          new Text(
            `  ${theme.fg("muted", "Skills: ")}${args.skills.join(", ")}`,
            0,
            0,
          ),
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

      const {
        toolCalls,
        spinnerFrame,
        response,
        aborted,
        error,
        usage,
        resolvedModel,
        familyUnknown,
      } = details;

      // Counts
      const doneCount = toolCalls.filter((tc) => tc.status === "done").length;
      const runningCount = toolCalls.filter(
        (tc) => tc.status === "running",
      ).length;
      const errorCount = toolCalls.filter((tc) => tc.status === "error").length;

      const footer = new SubagentFooter(theme, {
        resolvedModel,
        usage,
        toolCalls,
        familyUnknown,
      });

      // Aborted state
      if (aborted) {
        const container = new Container();
        const suffix =
          doneCount > 0
            ? ` (${doneCount} ${pluralize(doneCount, "tool call")} completed)`
            : "";
        container.addChild(
          new Text(
            theme.fg("warning", "Aborted") + theme.fg("muted", suffix),
            0,
            0,
          ),
        );
        container.addChild(footer);
        return container;
      }

      // Error state
      if (error) {
        const container = new Container();
        container.addChild(
          new Text(theme.fg("error", `Error: ${error}`), 0, 0),
        );
        container.addChild(footer);
        return container;
      }

      // Running + collapsed: show current tool + footer
      if (isPartial && !expanded) {
        const container = new Container();

        const currentTool = toolCalls.find((tc) => tc.status === "running");
        if (currentTool) {
          const spinner = getSpinnerFrame(spinnerFrame);

          // Show partialResult text if available (e.g., "Indexing...")
          const partialText = currentTool.partialResult?.content?.[0];
          if (partialText?.type === "text" && partialText.text) {
            container.addChild(
              new Text(`${spinner} ${partialText.text}`, 0, 0),
            );
          } else {
            const { label, detail } = formatLookoutToolCall(currentTool);
            const text = detail ? `${label} ${detail}` : label;
            container.addChild(new Text(`${spinner} ${text}`, 0, 0));
          }
        } else {
          container.addChild(
            new Text(
              theme.fg("muted", `${getSpinnerFrame(spinnerFrame)} thinking...`),
              0,
              0,
            ),
          );
        }

        container.addChild(new Spacer(1));
        container.addChild(footer);
        return container;
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

        container.addChild(new Spacer(1));
        container.addChild(footer);
        return container;
      }

      // Done + collapsed
      if (!expanded) {
        const container = new Container();

        const allFailed =
          toolCalls.length > 0 && errorCount === toolCalls.length;
        const stats = formatSubagentStats(
          usage ?? { estimatedTokens: Math.round((response?.length ?? 0) / 4) },
          toolCalls.length,
        );
        const indicator = allFailed ? INDICATOR.error : INDICATOR.done;
        const indicatorColor = allFailed ? "error" : "success";

        container.addChild(
          new Text(
            theme.fg(indicatorColor, `${indicator} `) +
              theme.fg("muted", stats),
            0,
            0,
          ),
        );
        container.addChild(footer);
        return container;
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
      }

      container.addChild(footer);
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
