/**
 * Scout subagent - web research and URL fetching.
 *
 * Takes a URL and/or query with a prompt, and returns a detailed
 * answer based on fetched information.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  Skill,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, type Theme } from "@mariozechner/pi-coding-agent";
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
      _toolCallId: string,
      args: ScoutInput,
      onUpdate: AgentToolUpdateCallback<ScoutDetails> | undefined,
      ctx: ExtensionContext,
      signal?: AbortSignal,
    ) {
      const { url, query, repo, prompt, skills: skillNames } = args;

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
            url,
            query,
            repo,
            prompt,
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
              url,
              query,
              repo,
              prompt,
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
            url,
            query,
            repo,
            prompt,
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
            customTools: createScoutTools(),
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
                url,
                query,
                repo,
                prompt,
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
                url,
                query,
                repo,
                prompt,
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
              url,
              query,
              repo,
              prompt,
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
              url,
              query,
              repo,
              prompt,
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
              url,
              query,
              repo,
              prompt,
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
            url,
            query,
            repo,
            prompt,
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
        new Text(theme.fg("toolTitle", theme.bold("Scout")), 0, 0),
      );

      // URL (if provided)
      if (args.url) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "URL: ")}${args.url}`, 0, 0),
        );
      }

      // Query (if provided)
      if (args.query) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Query: ")}${args.query}`, 0, 0),
        );
      }

      // Repo (if provided)
      if (args.repo) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Repo: ")}${args.repo}`, 0, 0),
        );
      }

      // Prompt (if provided)
      if (args.prompt) {
        container.addChild(
          new Text(`  ${theme.fg("muted", "Prompt: ")}${args.prompt}`, 0, 0),
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
      result: AgentToolResult<ScoutDetails>,
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

          // Show partialResult text if available (e.g., progress updates)
          const partialText = currentTool.partialResult?.content?.[0];
          if (partialText?.type === "text" && partialText.text) {
            container.addChild(
              new Text(`${spinner} ${partialText.text}`, 0, 0),
            );
          } else {
            const { label, detail } = formatScoutToolCall(currentTool);
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
              const { label, detail } = formatScoutToolCall(tc);
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

      // Stats line - only show error indicator when ALL tools failed
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
        const toolNames = toolCalls.map((tc) => formatScoutToolCall(tc).label);
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
          const { label, detail } = formatScoutToolCall(tc);
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

/** Execute the scout subagent directly (without tool wrapper) */
export async function executeScout(
  input: ScoutInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<ScoutDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<ScoutDetails>> {
  const tool = createScoutTool();
  return tool.execute("direct", input, onUpdate, ctx, signal);
}
