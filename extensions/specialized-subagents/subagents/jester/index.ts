/**
 * Jester subagent - generates random, creative, and unexpected content. No tools.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  Theme,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  MarkdownResponse,
  SubagentFooter,
  ToolDetails,
  type ToolDetailsField,
  ToolPreview,
  type ToolPreviewField,
} from "../../components";
import { executeSubagent, resolveModel } from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { MODEL } from "./config";
import { JESTER_SYSTEM_PROMPT } from "./system-prompt";
import type { JesterDetails, JesterInput } from "./types";

export const JESTER_GUIDANCE = `
## Jester

Use jester when you need to generate random data, creative content, or unexpected outputs.

**When to use:**
- Generating lists of random names, sentences, or text
- Creating placeholder data or test fixtures
- Brainstorming unusual ideas
- Producing varied, creative content

**When NOT to use:**
- Anything requiring web research, up-to-date facts, or codebase inspection
- Deterministic or factual outputs

**Input:**
- \`question\`: description of what random data to generate
`;

const parameters = Type.Object({
  question: Type.String({
    description: "Description of what random data to generate (no tools)",
  }),
});

export function createJesterTool(): ToolDefinition<
  typeof parameters,
  JesterDetails
> {
  return {
    name: "jester",
    label: "Jester",
    description:
      "Generate random, creative, and unexpected content. No tools, no browsing, no files.",
    parameters,

    async execute(
      _toolCallId: string,
      args: JesterInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<JesterDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<JesterDetails>> {
      const { question } = args;

      let resolvedModel: { provider: string; id: string } | undefined;

      const toolCalls: SubagentToolCall[] = [];
      let spinnerFrame = 0;

      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            question,
            toolCalls,
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
            question,
            toolCalls,
            spinnerFrame,
            resolvedModel,
          },
        });

        // Note: Temperature/topK are not yet exposed through createAgentSession API.
        // To maximize randomness, we rely on prompt engineering and model selection.
        // Using Haiku for speed; randomness comes from varied system instructions.
        const userMessage = question;

        const result = await executeSubagent(
          {
            name: "jester",
            model,
            systemPrompt: JESTER_SYSTEM_PROMPT,
            tools: [],
            customTools: [],
            thinkingLevel: "off",
            logging: {
              enabled: true,
              debug: true,
            },
          },
          userMessage,
          ctx,
          (_delta, accumulated) => {
            onUpdate?.({
              content: [{ type: "text", text: accumulated }],
              details: {
                question,
                toolCalls,
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
              question,
              toolCalls,
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
              question,
              toolCalls,
              spinnerFrame,
              error: result.error,
              usage: result.usage,
              resolvedModel,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.content }],
          details: {
            question,
            toolCalls,
            spinnerFrame,
            response: result.content,
            usage: result.usage,
            resolvedModel,
          },
        };
      } catch (err) {
        const error =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : JSON.stringify(err);

        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: {
            question,
            toolCalls,
            spinnerFrame,
            error,
            resolvedModel,
          },
        };
      } finally {
        clearInterval(spinnerInterval);
      }
    },

    renderCall(args, theme) {
      const fields: ToolPreviewField[] = [];
      if (args.question) {
        fields.push({ label: "Q", value: args.question });
      }
      return new ToolPreview({ title: "Jester", fields }, theme);
    },

    renderResult(
      result: AgentToolResult<JesterDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;

      if (!details) {
        const text = result.content[0];
        const content = text?.type === "text" ? text.text : "";
        return new Text(content || "", 0, 0);
      }

      const { response, aborted, error, usage, toolCalls, resolvedModel } =
        details;

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
        fields.push(new MarkdownResponse(response, theme));
      }

      return new ToolDetails({ fields, footer }, options, theme);
    },
  };
}

export async function executeJester(
  input: JesterInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<JesterDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<JesterDetails>> {
  const tool = createJesterTool();
  return tool.execute("direct", input, signal, onUpdate, ctx);
}
