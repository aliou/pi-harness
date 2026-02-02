/**
 * Oracle subagent - expert AI advisor for complex reasoning.
 *
 * Uses GPT-5.2 for architecture planning, code review, and strategic guidance.
 * Advisory-only (no tools) - invoked zero-shot with no follow-ups.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  Skill,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, type Theme } from "@mariozechner/pi-coding-agent";
import { Markdown, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  MarkdownResponse,
  SubagentFooter,
  ToolDetails,
  type ToolDetailsField,
  ToolPreview,
  type ToolPreviewField,
} from "../../components";
import { executeSubagent, resolveModel, resolveSkillsByName } from "../../lib";
import { MODEL } from "./config";
import { ORACLE_SYSTEM_PROMPT } from "./system-prompt";
import { createOracleTools } from "./tools";
import type { OracleDetails, OracleInput } from "./types";

/** System prompt guidance for oracle tool usage */
export const ORACLE_GUIDANCE = `
## Oracle

Use oracle when making plans, reviewing your own work, understanding existing code behavior, or debugging code that does not work.

When calling oracle, tell the user why: "I'm going to ask the oracle for advice" or "I need to consult with the oracle."

### Oracle Examples

**Architecture review:**
- User: "review the authentication system we just built"
- Action: use oracle with relevant files to analyze architecture, then improve based on response

**Debugging:**
- User: "I'm getting race conditions when I run this test"
- Action: run test to confirm, then use oracle with files and context about test run and race condition

**Planning:**
- User: "plan the implementation of real-time collaboration features"
- Action: use lookout to locate relevant files, then use oracle to plan implementation

**Implementation guidance:**
- User: "implement a new user authentication system with JWT tokens"
- Action: use oracle to analyze current patterns and plan approach, then proceed with implementation

**Optimization:**
- User: "I need to optimize this slow database query"
- Action: use oracle to analyze performance issues and get recommendations, then implement
`;

const parameters = Type.Object({
  task: Type.String({ description: "What to help with" }),
  context: Type.Optional(Type.String({ description: "Background info" })),
  files: Type.Optional(
    Type.Array(Type.String(), { description: "Files to examine" }),
  ),
  skills: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Skill names to provide specialized context (e.g., 'ios-26', 'drizzle-orm')",
    }),
  ),
});

/** Format files for context */
async function formatFilesForContext(
  files: string[],
  cwd: string,
): Promise<string> {
  const contents: string[] = [];

  for (const file of files) {
    const fullPath = path.resolve(cwd, file);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      contents.push(`### ${file}\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      contents.push(`### ${file}\n(file not found or unreadable)`);
    }
  }

  return contents.join("\n\n");
}

/** Build the user message for the subagent based on inputs */
function buildUserMessage(input: OracleInput, filesContent?: string): string {
  let userMessage = `## Task\n${input.task}`;

  if (input.context) {
    userMessage += `\n\n## Context\n${input.context}`;
  }

  if (filesContent) {
    userMessage += `\n\n## Files\n${filesContent}`;
  }

  return userMessage;
}

/** Create the oracle tool definition for use in extensions */
export function createOracleTool(): ToolDefinition<
  typeof parameters,
  OracleDetails
> {
  return {
    name: "oracle",
    label: "Oracle",
    description: `Consult the Oracle - an AI advisor powered by GPT-5 for complex reasoning.

WHEN TO USE:
- Code reviews and architecture feedback
- Finding bugs across multiple files
- Planning complex implementations or refactoring
- Deep technical questions requiring reasoning

WHEN NOT TO USE:
- Simple file reading (use read)
- Codebase searches (use lookout)
- Basic code modifications (do it yourself or use task)

Pass relevant skills (e.g., 'ios-26', 'drizzle-orm') to provide specialized context for the task.`,

    parameters,

    async execute(
      _toolCallId: string,
      args: OracleInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<OracleDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const { task, context, files, skills: skillNames } = args;

      // Resolve skills if provided
      let resolvedSkills: Skill[] = [];
      let notFoundSkills: string[] = [];

      if (skillNames && skillNames.length > 0) {
        const result = resolveSkillsByName(skillNames, ctx.cwd);
        resolvedSkills = result.skills;
        notFoundSkills = result.notFound;
      }

      let resolvedModel: { provider: string; id: string } | undefined;

      let spinnerFrame = 0;

      // Set up spinner animation interval
      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            task,
            context,
            files,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            spinnerFrame,
            resolvedModel,
          },
        });
      }, 80);

      try {
        const model = resolveModel(MODEL, ctx);
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved provider/model as early as possible for footer rendering.
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            task,
            context,
            files,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
            spinnerFrame,
            resolvedModel,
          },
        });

        // Format files if provided
        let filesContent: string | undefined;
        if (files && files.length > 0) {
          filesContent = await formatFilesForContext(files, ctx.cwd);
        }

        let userMessage = buildUserMessage(args, filesContent);

        // Append warning if skills not found
        if (notFoundSkills.length > 0) {
          userMessage += `\n\n**Note:** The following skills were not found and could not be loaded: ${notFoundSkills.join(", ")}`;
        }

        const result = await executeSubagent(
          {
            name: "oracle",
            model,
            systemPrompt: ORACLE_SYSTEM_PROMPT,
            skills: resolvedSkills,
            customTools: createOracleTools(),
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
                task,
                context,
                files,
                skills: skillNames,
                skillsResolved: resolvedSkills.length,
                skillsNotFound:
                  notFoundSkills.length > 0 ? notFoundSkills : undefined,
                toolCalls: [],
                spinnerFrame,
                response: accumulated,
                resolvedModel,
              },
            });
          },
          signal,
        );

        if (result.aborted) {
          return {
            content: [{ type: "text" as const, text: "Aborted" }],
            details: {
              task,
              context,
              files,
              skills: skillNames,
              skillsResolved: resolvedSkills.length,
              skillsNotFound:
                notFoundSkills.length > 0 ? notFoundSkills : undefined,
              toolCalls: [],
              spinnerFrame,
              aborted: true,
              usage: result.usage,
              resolvedModel,
            },
          };
        }

        // Throw on error so the tool call is marked as failed
        if (result.error) {
          throw new Error(result.error);
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            task,
            context,
            files,
            skills: skillNames,
            skillsResolved: resolvedSkills.length,
            skillsNotFound:
              notFoundSkills.length > 0 ? notFoundSkills : undefined,
            toolCalls: [],
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
      const fields: ToolPreviewField[] = [];
      if (args.files?.length) {
        fields.push({
          label: "Files",
          value: `${args.files.length} file${args.files.length > 1 ? "s" : ""}`,
        });
      }
      if (args.skills?.length) {
        fields.push({ label: "Skills", value: args.skills.join(", ") });
      }
      return new ToolPreview({ title: "Oracle", fields }, theme);
    },

    renderResult(
      result: AgentToolResult<OracleDetails>,
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
        response,
        aborted,
        error,
        usage,
        toolCalls,
        resolvedModel,
        task,
        context,
        files,
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
        if (task) {
          fields.push({ label: "Task", value: task });
        }
        if (context) {
          fields.push({ label: "Context", value: context });
        }
        if (files?.length) {
          fields.push({ label: "Files", value: files.join(", ") });
        }
        fields.push(new MarkdownResponse(response, theme));
      }

      return new ToolDetails({ fields, footer }, options, theme);
    },
  };
}

/** Execute the oracle subagent directly (without tool wrapper) */
export async function executeOracle(
  input: OracleInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<OracleDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<OracleDetails>> {
  const tool = createOracleTool();
  return tool.execute("direct", input, signal, onUpdate, ctx);
}
