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
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<LookoutDetails> | undefined,
      ctx: ExtensionContext,
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
          (_delta, _accumulated) => {
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
          },
        };
      } finally {
        clearInterval(spinnerInterval);
      }
    },

    renderCall(args, theme) {
      const fields: ToolPreviewField[] = [
        { label: "Query", value: args.query },
      ];
      if (args.cwd) fields.push({ label: "Directory", value: args.cwd });
      if (args.skills?.length)
        fields.push({ label: "Skills", value: args.skills.join(", ") });
      return new ToolPreview({ title: "Lookout", fields }, theme);
    },

    renderResult(
      result: AgentToolResult<LookoutDetails>,
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
          new ToolCallSummary(toolCalls, formatLookoutToolCall, theme),
        );
        fields.push(
          new FailedToolCalls(toolCalls, formatLookoutToolCall, theme),
        );
        fields.push(new MarkdownResponse(response, theme));
      } else {
        // Running state
        fields.push(
          new ToolCallList(
            toolCalls,
            formatLookoutToolCall,
            theme,
            spinnerFrame,
          ),
        );
      }

      return new ToolDetails({ fields, footer }, options, theme);
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
  return tool.execute("direct", input, signal, onUpdate, ctx);
}
