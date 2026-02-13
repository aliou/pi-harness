/**
 * Scout subagent - web research and URL fetching.
 *
 * Takes a URL and/or query with a prompt, and returns a detailed
 * answer based on fetched information.
 */

import {
  createExecutionTimer,
  wrapToolDefinitionsWithTiming,
} from "@aliou/pi-agent-kit";
import { webFetchTool, webSearchTool } from "@aliou/pi-linkup/tools";

// Fail-fast: ensure Linkup tools resolved correctly from @aliou/pi-linkup/tools.
// If these assertions fire, the installed version likely lacks the "./tools" export
// (requires >=0.7.1).
if (!webSearchTool || webSearchTool.name !== "linkup_web_search") {
  throw new Error(
    `[scout] webSearchTool not found or has unexpected name (got ${webSearchTool?.name ?? "undefined"}). ` +
      "Ensure @aliou/pi-linkup >=0.7.1 is installed.",
  );
}
if (!webFetchTool || webFetchTool.name !== "linkup_web_fetch") {
  throw new Error(
    `[scout] webFetchTool not found or has unexpected name (got ${webFetchTool?.name ?? "undefined"}). ` +
      "Ensure @aliou/pi-linkup >=0.7.1 is installed.",
  );
}

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
  Theme,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getSubagentModelConfig, isDebugEnabled } from "../../config";
import { executeSubagent, resolveModel, resolveSkillsByName } from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { SCOUT_SYSTEM_PROMPT } from "./system-prompt";
import { formatScoutToolCall } from "./tool-formatter";
import { createScoutTools } from "./tools";
import type { ScoutDetails, ScoutInput } from "./types";

/** System prompt guidance for scout tool usage */
export const SCOUT_GUIDANCE = `
## Scout

Use scout for web research and GitHub codebase exploration. It can fetch URLs, search the web, and deeply explore GitHub repositories.

**When to use:**
- Fetching content from URLs (articles, documentation, webpages)
- Searching the web for information
- Exploring GitHub repositories (code, structure, commits, issues, PRs)
- Understanding how open-source projects work
- Finding implementations across codebases
- Analyzing code evolution through commit history

**When NOT to use:**
- Local codebase search (use lookout instead)
- Testing API endpoints (use curl instead)
- Making POST/PUT/DELETE requests

**Inputs:**
- \`url\`: Specific URL to fetch
- \`query\`: Search query for web or GitHub research
- \`repo\`: GitHub repository to focus on (owner/repo format)
- \`prompt\`: Question to answer based on fetched content

At least one of url, query, or repo is required.

**Note:** Scout always provides LLM-analyzed responses. For raw markdown content without analysis, use the \`web_fetch\` tool instead.

**Examples:**
- Fetch a URL: \`{ url: "https://example.com/docs", prompt: "What is the API rate limit?" }\`
- Web search: \`{ query: "typescript best practices 2025", prompt: "Summarize the top 3 practices" }\`
- Explore repo: \`{ repo: "facebook/react", prompt: "how is useState implemented?" }\`
- GitHub search: \`{ query: "useState implementation", repo: "facebook/react", prompt: "explain the implementation" }\`
- Issue/PR: \`{ url: "https://github.com/owner/repo/issues/123", prompt: "what is the current status?" }\`

**Repository mappings:**
Some npm packages are published under a different owner than the actual GitHub repository:
- All repositories starting with \`mariozechner/pi-*\` are located in \`badlogic/pi-mono\` monorepo

When you need to research a package like \`@mariozechner/pi-coding-agent\` or \`@mariozechner/pi-tui\`, use \`badlogic/pi-mono\` as the repository and search within the monorepo for the relevant package code.

**GitHub capabilities:**
- Read files and list directories
- Search code across repositories
- Search commits by message, author, or path
- View commit diffs
- List/filter issues and PRs in a repository
- Fetch individual issues and PRs with comments
- View PR diffs (changed files with patches)
- View PR reviews and inline code comments
- Compare branches, tags, or commits
`;

const parameters = Type.Object({
  url: Type.Optional(
    Type.String({
      description: "Specific URL to fetch content from",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Search query for web or GitHub research",
    }),
  ),
  repo: Type.Optional(
    Type.String({
      description: "GitHub repository to focus on (owner/repo format)",
    }),
  ),
  prompt: Type.String({
    description: "What to analyze or answer based on the fetched content.",
  }),
  skills: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Skill names to provide specialized context (e.g., 'ios-26', 'drizzle-orm')",
    }),
  ),
});

/** Build the user message for the subagent based on inputs */
function buildUserMessage(input: ScoutInput): string {
  const parts: string[] = [];

  if (input.url) {
    parts.push(`URL to fetch: ${input.url}`);
  }

  if (input.query) {
    parts.push(`Search query: ${input.query}`);
  }

  if (input.repo) {
    parts.push(`GitHub repository to explore: ${input.repo}`);
  }

  parts.push(`\nQuestion/Task: ${input.prompt}`);

  return parts.join("\n");
}

/** Create the scout tool definition for use in extensions */
export function createScoutTool(): ToolDefinition<
  typeof parameters,
  ScoutDetails
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
    name: "scout",
    label: "Scout",
    description: `Research assistant for web content and GitHub codebase exploration.

Inputs (at least one of url, query, or repo required):
- url: Specific URL to fetch
- query: Search query for web or GitHub research
- repo: GitHub repository to focus on (owner/repo format)
- prompt: Question to answer based on content

Use cases:
- Fetch a URL: { url: "https://...", prompt: "What is the API rate limit?" }
- Web search: { query: "how to...", prompt: "Summarize best practices" }
- Explore repo: { repo: "facebook/react", prompt: "how is useState implemented?" }
- GitHub search: { query: "useState", repo: "facebook/react", prompt: "explain implementation" }
- Fetch issue/PR: { url: "https://github.com/owner/repo/issues/123", prompt: "what is the status?" }

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,

    parameters,

    async execute(
      toolCallId: string,
      args: ScoutInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<ScoutDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const { url, query, repo, prompt, skills: skillNames } = args;
      const executionTimer = createExecutionTimer();

      // Resolve skills if provided
      let resolvedSkills: Skill[] = [];
      let notFoundSkills: string[] = [];

      if (skillNames && skillNames.length > 0) {
        const result = resolveSkillsByName(skillNames, ctx.cwd);
        resolvedSkills = result.skills;
        notFoundSkills = result.notFound;
      }

      // Validate: at least one of url, query, or repo required
      if (!url && !query && !repo) {
        const error = "At least one of 'url', 'query', or 'repo' is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            _renderKey: toolCallId,
            url,
            query,
            repo,
            prompt,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            error,
            totalDurationMs: executionTimer.getDurationMs(),
          },
        };
      }

      let resolvedModel: { provider: string; id: string } | undefined;

      let currentToolCalls: SubagentToolCall[] = [];

      try {
        const modelConfig = getSubagentModelConfig("scout");
        const model = resolveModel(
          modelConfig.provider,
          modelConfig.model,
          ctx,
        );
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved provider/model as early as possible for footer rendering.
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            _renderKey: toolCallId,
            url,
            query,
            repo,
            prompt,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: currentToolCalls,
            resolvedModel,
          },
        });

        let userMessage = buildUserMessage(args);

        // Append warning if skills not found
        if (notFoundSkills.length > 0) {
          userMessage += `\n\n**Note:** The following skills were not found and could not be loaded: ${notFoundSkills.join(", ")}`;
        }

        const result = await executeSubagent(
          {
            name: "scout",
            model,
            systemPrompt: SCOUT_SYSTEM_PROMPT,
            skills: resolvedSkills,
            customTools: wrapToolDefinitionsWithTiming([
              webSearchTool,
              webFetchTool,
              ...createScoutTools(),
            ]),
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
                url,
                query,
                repo,
                prompt,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
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
                _renderKey: toolCallId,
                url,
                query,
                repo,
                prompt,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
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
              _renderKey: toolCallId,
              url,
              query,
              repo,
              prompt,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              aborted: true,
              usage: result.usage,
              resolvedModel,
              totalDurationMs: result.totalDurationMs,
            },
          };
        }

        if (result.error) {
          return {
            content: [
              { type: "text" as const, text: `Error: ${result.error}` },
            ],
            details: {
              _renderKey: toolCallId,
              url,
              query,
              repo,
              prompt,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              error: result.error,
              usage: result.usage,
              resolvedModel,
              totalDurationMs: result.totalDurationMs,
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
              url,
              query,
              repo,
              prompt,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              error,
              usage: result.usage,
              resolvedModel,
              totalDurationMs: result.totalDurationMs,
            },
          };
        }

        // Check for failed tool calls and append notification
        const failedTools = finalToolCalls.filter(
          (tc) => tc.status === "error",
        );
        let finalContent = result.content;

        if (failedTools.length > 0) {
          finalContent += "\n\n---\n\n";
          finalContent += `**Note:** ${failedTools.length} tool call${failedTools.length > 1 ? "s" : ""} failed:\n\n`;

          for (const tc of failedTools) {
            finalContent += `- **${tc.toolName}**`;

            // Extract clean error message
            if (tc.error) {
              let errorText = tc.error;
              try {
                const parsed = JSON.parse(tc.error);
                if (parsed.content?.[0]?.text) {
                  errorText = parsed.content[0].text;

                  // Extract clean error from API responses
                  const apiErrorMatch = errorText.match(
                    /API error \(\d+\): ({.+})$/,
                  );
                  if (apiErrorMatch?.[1]) {
                    try {
                      const apiError = JSON.parse(apiErrorMatch[1]);
                      if (apiError.error) {
                        errorText = apiError.error;
                      }
                    } catch {
                      // Keep original
                    }
                  }
                }
              } catch {
                // Keep original
              }

              // Truncate long errors
              if (errorText.length > 120) {
                errorText = `${errorText.slice(0, 117)}...`;
              }

              finalContent += `: ${errorText}`;
            }

            finalContent += "\n";
          }
        }

        return {
          content: [{ type: "text" as const, text: finalContent }],
          details: {
            _renderKey: toolCallId,
            url,
            query,
            repo,
            prompt,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: finalToolCalls,
            response: result.content,
            usage: result.usage,
            resolvedModel,
            totalDurationMs: result.totalDurationMs,
          },
        };
      } finally {
      }
    },

    renderCall(args, theme) {
      const prompt = args.prompt?.trim() ?? "";

      return new ToolCallHeader(
        {
          toolName: "Scout",
          optionArgs: [
            ...(args.url ? [{ label: "url", value: args.url }] : []),
            ...(args.query ? [{ label: "query", value: args.query }] : []),
            ...(args.repo ? [{ label: "repo", value: args.repo }] : []),
            ...(args.skills?.length
              ? [{ label: "skills", value: args.skills.join(",") }]
              : []),
          ],
          longArgs: prompt
            ? [
                {
                  label: "prompt",
                  value: prompt,
                },
              ]
            : undefined,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<ScoutDetails>,
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
        totalDurationMs,
      } = details;

      const renderKey = _renderKey ?? "_default_";
      const cached = renderCache.get(renderKey);

      // Footer - reuse or create
      const footerData = { resolvedModel, usage, toolCalls, totalDurationMs };
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

      if (aborted) {
        fields.push({ label: "Status", value: "Aborted" });
      } else if (error) {
        fields.push({ label: "Error", value: error });
      } else if (response) {
        // Done state
        fields.push(new ToolCallSummary(toolCalls, formatScoutToolCall, theme));
        fields.push(new FailedToolCalls(toolCalls, formatScoutToolCall, theme));

        if (mdResponse) {
          mdResponse.setContent(response);
        } else {
          mdResponse = new MarkdownResponse(response, theme);
        }
        fields.push(mdResponse);
      } else {
        // Running state
        fields.push(new ToolCallList(toolCalls, formatScoutToolCall, theme));
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

/** Execute the scout subagent directly (without tool wrapper) */
export async function executeScout(
  input: ScoutInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<ScoutDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<ScoutDetails>> {
  const tool = createScoutTool();
  return tool.execute("direct", input, signal, onUpdate, ctx);
}
