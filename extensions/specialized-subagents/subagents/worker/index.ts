/**
 * Worker subagent - focused implementation agent for well-defined tasks.
 *
 * Sandboxed to specific files. Reads, edits, writes, and runs bash for
 * verification. Does not search or explore the codebase.
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
  createEditTool,
  type createReadOnlyTools,
  createReadTool,
  createWriteTool,
  getMarkdownTheme,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import { Markdown, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  FileList,
  MarkdownField,
  MarkdownResponse,
  SubagentFooter,
  ToolCallList,
  ToolDetails,
  type ToolDetailsField,
  ToolPreview,
  type ToolPreviewField,
} from "../../components";
import { executeSubagent, resolveModel, resolveSkillsByName } from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { pluralize } from "../../lib/ui/stats";
import { MODEL } from "./config";
import { WORKER_SYSTEM_PROMPT } from "./system-prompt";
import { createWorkerToolFormatter } from "./tool-formatter";
import type { WorkerDetails, WorkerInput } from "./types";

/** System prompt guidance for worker tool usage */
export const WORKER_GUIDANCE = `
## Worker

Delegate implementation work to the worker instead of doing it yourself when the task is well-defined and the files are known. The worker is a focused implementation agent: it reads, edits, writes files and runs verification commands. It is sandboxed to the files you provide.

**You SHOULD delegate to the worker when:**
- You already know which files need to change and what the change is
- The task is implementation, not exploration or planning
- Examples: migrating files to TypeScript, adding documentation, adding error handling, applying a refactoring pattern, fixing a known bug in specific files

**You should NOT delegate to the worker when:**
- You need to explore or search the codebase first (use lookout or scout)
- The scope is unclear or you don't know which files are involved
- The task is architectural planning (use oracle)

**Inputs:**
- \`task\`: Short description (~50 chars, for display only, not sent to the worker)
- \`instructions\`: Full instructions for the worker (be specific and complete)
- \`files\`: Array of file paths the worker should operate on
- \`context\`: Optional background info (e.g., patterns to follow, constraints)
- \`skills\`: Optional skill names for specialized context

**After the worker completes:** Review its output yourself. If the worker did not run verification (e.g., typecheck, tests, lint), do it yourself and fix any issues.

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
  return {
    name: "worker",
    label: "Worker",
    description: `Focused implementation agent for well-defined tasks on specific files.

The worker reads, edits, writes files and runs bash for verification. It is sandboxed to the files you provide. It does not search or explore the codebase.

Use for: file migrations, adding docs/types, applying refactoring patterns, adding error handling, fixing known bugs in specific files.

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,

    parameters,

    async execute(
      _toolCallId: string,
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
            task,
            instructions: "",
            files,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            spinnerFrame: 0,
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
            task,
            instructions,
            files: [],
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            spinnerFrame: 0,
            error,
            cwd: ctx.cwd,
          },
        };
      }

      let resolvedModel: { provider: string; id: string } | undefined;

      let currentToolCalls: SubagentToolCall[] = [];
      let spinnerFrame = 0;

      // Set up spinner animation interval
      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        if (currentToolCalls.some((tc) => tc.status === "running")) {
          onUpdate?.({
            content: [{ type: "text", text: "" }],
            details: {
              task,
              instructions,
              files,
              context,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: currentToolCalls,
              spinnerFrame,
              resolvedModel,
              cwd: ctx.cwd,
            },
          });
        }
      }, 80);

      try {
        const model = resolveModel(MODEL, ctx);
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved provider/model as early as possible
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            task,
            instructions,
            files,
            context,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: currentToolCalls,
            spinnerFrame,
            resolvedModel,
            cwd: ctx.cwd,
          },
        });

        let userMessage = buildUserMessage(args);

        // Append warning if skills not found
        if (notFoundSkills.length > 0) {
          userMessage += `\n\n**Note:** The following skills were not found and could not be loaded: ${notFoundSkills.join(", ")}`;
        }

        // Sandboxed tools: read, edit, write, bash. No grep/find/ls.
        type BuiltinTool = ReturnType<typeof createReadOnlyTools>[number];
        const tools: BuiltinTool[] = [
          createReadTool(ctx.cwd) as BuiltinTool,
          createEditTool(ctx.cwd) as BuiltinTool,
          createWriteTool(ctx.cwd) as BuiltinTool,
          createBashTool(ctx.cwd) as BuiltinTool,
        ];

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
                task,
                instructions,
                files,
                context,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                spinnerFrame,
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
                task,
                instructions,
                files,
                context,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: currentToolCalls,
                spinnerFrame,
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
              task,
              instructions,
              files,
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
              cwd: ctx.cwd,
            },
          };
        }

        if (result.error) {
          return {
            content: [
              { type: "text" as const, text: `Error: ${result.error}` },
            ],
            details: {
              task,
              instructions,
              files,
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
              task,
              instructions,
              files,
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
              cwd: ctx.cwd,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            task,
            instructions,
            files,
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
            cwd: ctx.cwd,
          },
        };
      } finally {
        clearInterval(spinnerInterval);
      }
    },

    renderCall(args, theme) {
      const fields: ToolPreviewField[] = [{ label: "Task", value: args.task }];

      // Only add optional fields if present
      if (args.skills?.length) {
        fields.push({ label: "Skills", value: args.skills.join(", ") });
      }

      return new ToolPreview({ title: "Worker", fields }, theme);
    },

    renderResult(
      result: AgentToolResult<WorkerDetails>,
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
        files,
        instructions,
        cwd,
      } = details;

      // Counts
      const doneCount = toolCalls.filter((tc) => tc.status === "done").length;

      const footer = new SubagentFooter(theme, {
        resolvedModel,
        usage,
        toolCalls,
      });

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
        fields.push(new MarkdownResponse(response, theme));
      } else {
        // Running state
        fields.push(
          new ToolCallList(toolCalls, formatToolCall, theme, spinnerFrame),
        );
      }

      return new ToolDetails({ fields, footer }, options, theme);
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
