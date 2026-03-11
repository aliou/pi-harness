/**
 * Lookout subagent - local codebase search by functionality or concept.
 *
 * Uses ast-grep structural search combined with Pi's built-in tools
 * (grep, find, read, ls) for comprehensive code discovery.
 */

import {
  createRenderCache,
  FailedToolCalls,
  MarkdownResponse,
  renderToolTextFallback,
  SubagentFooter,
  ToolCallHeader,
  ToolCallList,
  ToolCallSummary,
  ToolDetails,
  type ToolDetailsField,
} from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  Skill,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { createReadOnlyTools, type Theme } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { isDebugEnabled } from "../../config";
import {
  executeSubagent,
  resolveSkillsByName,
  shouldFailToolCallForModelIssue,
} from "../../lib";
import { selectModelForSubagent } from "../../lib/subagent-model-selection";
import type { SubagentToolCall } from "../../lib/types";
import { LOOKOUT_SYSTEM_PROMPT } from "./system-prompt";
import { createLookoutToolFormatter } from "./tool-formatter";
import { createLookoutTools } from "./tools";
import type { LookoutDetails, LookoutInput } from "./types";

const LOOKOUT_DEFAULT_SKILLS = [] as const;

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

Lookout uses codemogger for semantic code search (natural language queries matched against code structure via embeddings).

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
  // Render cache for reusing components across updates
  const renderCache = createRenderCache<
    string,
    {
      toolDetails: ToolDetails;
      footer: SubagentFooter;
      markdownResponse: MarkdownResponse | null;
    }
  >();

  return {
    name: "lookout",
    label: "Lookout",
    description: `Local codebase search by functionality or concept.

Uses codemogger semantic search + grep/find for comprehensive code discovery.
Returns relevant files with line ranges.

Example: { "query": "where do we handle authentication" }

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,
    parameters,

    async execute(
      toolCallId: string,
      args: LookoutInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<LookoutDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const { query, cwd: customCwd, skills: skillNames } = args;
      const effectiveSkillNames = [
        ...new Set([...LOOKOUT_DEFAULT_SKILLS, ...(skillNames ?? [])]),
      ];

      // Resolve requested + built-in skills
      let resolvedSkills: Skill[] = [];
      let notFoundSkills: string[] = [];

      if (effectiveSkillNames.length > 0) {
        const result = resolveSkillsByName(effectiveSkillNames, ctx.cwd);
        resolvedSkills = result.skills;
        notFoundSkills = result.notFound;
      }

      // Validate: query is required
      if (!query) {
        const error = "Query is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            _renderKey: toolCallId,
            query: "",
            skills: effectiveSkillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            error,
            cwd: customCwd ?? ctx.cwd,
          },
        };
      }

      // Use custom cwd if provided, otherwise use context cwd
      const workingDir = customCwd ?? ctx.cwd;

      let resolvedModel: { provider: string; id: string } | undefined;

      let currentToolCalls: SubagentToolCall[] = [];

      try {
        const model = selectModelForSubagent("lookout", ctx);
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved provider/model as early as possible for footer rendering.
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            _renderKey: toolCallId,
            query,
            skills: effectiveSkillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: currentToolCalls,
            resolvedModel,
            cwd: workingDir,
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
            customTools: createLookoutTools(workingDir),
            thinkingLevel: "off",
            logging: {
              enabled: true,
              debug: isDebugEnabled(),
            },
          },
          userMessage,
          ctx,
          // onTextUpdate
          (_delta, _accumulated) => {
            onUpdate?.({
              content: [{ type: "text", text: "" }],
              details: {
                _renderKey: toolCallId,
                query,
                skills: effectiveSkillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                resolvedModel,
                cwd: workingDir,
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
                _renderKey: toolCallId,
                query,
                skills: effectiveSkillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                resolvedModel,
                cwd: workingDir,
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
              _renderKey: toolCallId,
              query,
              skills: effectiveSkillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              aborted: true,
              usage: result.usage,
              resolvedModel,
              cwd: workingDir,
            },
          };
        }

        if (result.error) {
          if (shouldFailToolCallForModelIssue(result)) {
            throw new Error(result.error);
          }

          return {
            content: [
              { type: "text" as const, text: `Error: ${result.error}` },
            ],
            details: {
              _renderKey: toolCallId,
              query,
              skills: effectiveSkillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              error: result.error,
              usage: result.usage,
              resolvedModel,
              cwd: workingDir,
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
              _renderKey: toolCallId,
              query,
              skills: effectiveSkillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              error,
              usage: result.usage,
              resolvedModel,
              cwd: workingDir,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            _renderKey: toolCallId,
            query,
            skills: effectiveSkillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: finalToolCalls,
            response: result.content,
            usage: result.usage,
            resolvedModel,
            cwd: workingDir,
          },
        };
      } finally {
      }
    },

    renderCall(args, theme) {
      const query = args.query?.trim() ?? "";

      return new ToolCallHeader(
        {
          toolName: "Lookout",
          mainArg: query,
          optionArgs: [
            ...(args.cwd ? [{ label: "cwd", value: args.cwd }] : []),
            ...(args.skills?.length
              ? [{ label: "skills", value: args.skills.join(",") }]
              : []),
          ],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<LookoutDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;

      // Fallback if details missing
      if (!details) {
        return renderToolTextFallback(result, theme);
      }

      const {
        _renderKey,
        toolCalls,
        response,
        aborted,
        error,
        usage,
        resolvedModel,
        cwd,
      } = details;

      const renderKey = _renderKey ?? "_default_";
      const cached = renderCache.get(renderKey);

      // Footer - reuse or create
      const footerData = { resolvedModel, usage, toolCalls };
      let footer: SubagentFooter;
      if (cached) {
        footer = cached.footer;
        footer.updateData(footerData);
      } else {
        footer = new SubagentFooter(theme, footerData);
      }

      // MarkdownResponse - reuse or create
      let mdResponse = cached?.markdownResponse ?? null;

      // Build fields based on state
      const fields: ToolDetailsField[] = [];
      const formatToolCall = createLookoutToolFormatter(cwd);

      if (aborted) {
        fields.push({ label: "Status", value: "Aborted" });
      } else if (error) {
        fields.push({ label: "Error", value: error });
      } else if (response) {
        // Done state
        if (isDebugEnabled()) {
          fields.push(new ToolCallList(toolCalls, formatToolCall, theme));
        } else {
          fields.push(new ToolCallSummary(toolCalls, formatToolCall, theme));
        }
        fields.push(new FailedToolCalls(toolCalls, formatToolCall, theme));

        if (mdResponse) {
          mdResponse.setContent(response);
        } else {
          mdResponse = new MarkdownResponse(response, theme);
        }
        fields.push(mdResponse);
      } else {
        // Running state
        fields.push(new ToolCallList(toolCalls, formatToolCall, theme));
      }

      // ToolDetails - reuse or create
      let toolDetails: ToolDetails;
      if (cached) {
        toolDetails = cached.toolDetails;
        toolDetails.update({ fields, footer }, options);
      } else {
        toolDetails = new ToolDetails({ fields, footer }, options, theme);
      }

      // Update cache
      renderCache.set(renderKey, {
        toolDetails,
        footer,
        markdownResponse: mdResponse,
      });

      return toolDetails;
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
