/**
 * Worker subagent - focused implementation agent for well-defined tasks.
 *
 * Sandboxed to specific files. Reads, edits, writes, and runs bash for
 * verification. Does not search or explore the codebase.
 */

import {
  createRenderCache,
  FileList,
  MarkdownField,
  MarkdownResponse,
  renderToolTextFallback,
  SubagentFooter,
  ToolCallHeader,
  ToolCallList,
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
import {
  executeSubagent,
  resolveModel,
  resolveSkillsByName,
  shouldFailToolCallForModelIssue,
} from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { pluralize } from "../../lib/ui/stats";
import { WORKER_SYSTEM_PROMPT } from "./system-prompt";
import { createWorkerToolFormatter } from "./tool-formatter";
import { createWorkerTools } from "./tools";
import type { WorkerDetails, WorkerInput } from "./types";

/** System prompt guidance for worker tool usage */
export const WORKER_GUIDANCE = `
## Worker

Delegate implementation work to the worker instead of doing it yourself when the task is well-defined and the files are known. The worker is a focused implementation agent: it reads, edits, writes files and runs mandatory verification commands. It is sandboxed to the files you provide.

**You SHOULD delegate to the worker when:**
- You already know which files need to change and what the change is
- The task is implementation, not exploration or planning
- Examples: migrating files to TypeScript, adding documentation, adding error handling, applying a refactoring pattern, fixing a known bug in specific files

**You should NOT delegate to the worker when:**
- You need to explore or search the codebase first (use lookout or scout)
- The scope is unclear or you don't know which files are involved
- The task is architectural planning (use oracle)

**Worker verification policy (enforced):**
- Run relevant lint checks before finishing
- Run relevant type checks before finishing
- Run relevant tests before finishing
- Never use \`--no-verify\` for commits
- Never bypass checks by disabling lint/type/test gates unless explicitly authorized
- If checks cannot be run or cannot pass without forbidden bypasses, worker must call this out to the parent agent

**Inputs:**
- \`task\`: Short description (~50 chars, for display only, not sent to the worker)
- \`instructions\`: Full instructions for the worker (be specific and complete)
- \`files\`: Array of file paths the worker should operate on
- \`context\`: Optional background info (e.g., patterns to follow, constraints)
- \`skills\`: Optional skill names for specialized context

**After the worker completes:** Review its output yourself. If the worker reports unrun/failed checks or forbidden bypass pressure, resolve that before shipping.

**Example:**
\`\`\`json
{
  "task": "Convert helpers.js to TypeScript",
  "instructions": "Convert this file from JavaScript to TypeScript. Add proper type annotations for all function parameters and return types. Use generics where appropriate.",
  "files": ["src/utils/helpers.js"],
  "context": "Follow the typing patterns used in src/utils/types.ts"
}
\`\`\`
`;

const parameters = Type.Object({
  task: Type.String({
    description:
      "Short description of the task (~50 chars, for display only, not sent to the worker)",
  }),
  instructions: Type.String({
    description: "Full instructions for the worker (be specific and complete)",
  }),
  files: Type.Array(Type.String(), {
    description: "Files the worker should operate on",
  }),
  context: Type.Optional(
    Type.String({
      description:
        "Optional background info (e.g., patterns to follow, constraints)",
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
function buildUserMessage(input: WorkerInput): string {
  const parts: string[] = [];

  parts.push(`## Instructions\n${input.instructions}`);
  parts.push(`## Files\n${input.files.map((f) => `- ${f}`).join("\n")}`);

  if (input.context) {
    parts.push(`## Context\n${input.context}`);
  }

  return parts.join("\n\n");
}

/** Create the worker tool definition for use in extensions */
export function createWorkerTool(): ToolDefinition<
  typeof parameters,
  WorkerDetails
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
    name: "worker",
    label: "Worker",
    description: `Focused implementation agent for well-defined tasks on specific files.

The worker reads, edits, writes files and runs mandatory verification (lint, typecheck, tests) before finishing. It is sandboxed to the files you provide. It does not search or explore the codebase.

It must never use commit bypass flags like \`--no-verify\` and must not disable lint/type/test gates unless explicitly authorized. If checks cannot run/pass under those constraints, it reports that to the parent agent.

Use for: file migrations, adding docs/types, applying refactoring patterns, adding error handling, fixing known bugs in specific files.

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,

    parameters,

    async execute(
      toolCallId: string,
      args: WorkerInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<WorkerDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const { task, instructions, files, context, skills: skillNames } = args;

      // Resolve skills if provided
      let resolvedSkills: Skill[] = [];
      let notFoundSkills: string[] = [];

      if (skillNames && skillNames.length > 0) {
        const result = resolveSkillsByName(skillNames, ctx.cwd);
        resolvedSkills = result.skills;
        notFoundSkills = result.notFound;
      }

      // Validate: instructions and files are required
      if (!instructions) {
        const error = "Instructions are required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            _renderKey: toolCallId,
            task,
            instructions: "",
            files,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            error,
            cwd: ctx.cwd,
          },
        };
      }

      if (!files || files.length === 0) {
        const error = "At least one file is required.";
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            _renderKey: toolCallId,
            task,
            instructions,
            files: [],
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            error,
            cwd: ctx.cwd,
          },
        };
      }

      let resolvedModel: { provider: string; id: string } | undefined;

      let currentToolCalls: SubagentToolCall[] = [];

      try {
        const modelConfig = getSubagentModelConfig("worker");
        const model = resolveModel(
          modelConfig.provider,
          modelConfig.model,
          ctx,
        );
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved provider/model as early as possible
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            _renderKey: toolCallId,
            task,
            instructions,
            files,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: currentToolCalls,
            resolvedModel,
            cwd: ctx.cwd,
          },
        });

        let userMessage = buildUserMessage(args);

        // Append warning if skills not found
        if (notFoundSkills.length > 0) {
          userMessage += `\n\n**Note:** The following skills were not found and could not be loaded: ${notFoundSkills.join(", ")}`;
        }

        // Sandboxed tools: read/edit/write hard-scoped to provided files.
        // Bash is guarded for worker policy (no exploration, no --no-verify).
        const tools = createWorkerTools(ctx.cwd, files);

        const result = await executeSubagent(
          {
            name: "worker",
            model,
            systemPrompt: WORKER_SYSTEM_PROMPT,
            skills: resolvedSkills,
            tools,
            customTools: [],
            thinkingLevel: "low",
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
                task,
                instructions,
                files,
                context,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                resolvedModel,
                cwd: ctx.cwd,
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
                task,
                instructions,
                files,
                context,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                resolvedModel,
                cwd: ctx.cwd,
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
              task,
              instructions,
              files,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              aborted: true,
              usage: result.usage,
              resolvedModel,
              cwd: ctx.cwd,
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
              task,
              instructions,
              files,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              error: result.error,
              usage: result.usage,
              resolvedModel,
              cwd: ctx.cwd,
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
              task,
              instructions,
              files,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: finalToolCalls,
              error,
              usage: result.usage,
              resolvedModel,
              cwd: ctx.cwd,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            _renderKey: toolCallId,
            task,
            instructions,
            files,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: finalToolCalls,
            response: result.content,
            usage: result.usage,
            resolvedModel,
            cwd: ctx.cwd,
          },
        };
      } finally {
      }
    },

    renderCall(args, theme) {
      const task = args.task?.trim() ?? "";
      const shortTask = task.length > 80 ? `${task.slice(0, 77)}...` : task;

      return new ToolCallHeader(
        {
          toolName: "Worker",
          mainArg: shortTask,
          optionArgs: [
            { label: "files", value: String(args.files?.length ?? 0) },
            ...(args.skills?.length
              ? [{ label: "skills", value: args.skills.join(",") }]
              : []),
          ],
          longArgs: [
            ...(task.length > 80 ? [{ label: "task", value: task }] : []),
            ...(args.context
              ? [{ label: "context", value: args.context }]
              : []),
          ],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<WorkerDetails>,
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
        files,
        instructions,
        cwd,
      } = details;

      // Counts
      const doneCount = toolCalls.filter((tc) => tc.status === "done").length;

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
      const formatToolCall = createWorkerToolFormatter(cwd);

      // Instructions
      fields.push(new MarkdownField("Instructions", instructions, theme));

      // State-specific fields
      if (aborted) {
        const suffix =
          doneCount > 0
            ? ` (${doneCount} ${pluralize(doneCount, "tool call")} completed)`
            : "";
        fields.push({
          label: "Status",
          value: theme.fg("warning", "Aborted") + theme.fg("muted", suffix),
        });
      } else if (error) {
        fields.push({ label: "Error", value: error });
      } else if (response) {
        // Done state
        fields.push(new FileList(files, theme, cwd));
        fields.push(new ToolCallList(toolCalls, formatToolCall, theme));

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

/** Execute the worker subagent directly (without tool wrapper) */
export async function executeWorker(
  input: WorkerInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<WorkerDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<WorkerDetails>> {
  const tool = createWorkerTool();
  return tool.execute("direct", input, signal, onUpdate, ctx);
}
