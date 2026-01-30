/**
 * Jester subagent - generates random, creative, and unexpected content. No tools.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { SubagentFooter } from "../../components";
import { executeSubagent, resolveModel } from "../../lib";
import type { SubagentToolCall } from "../../lib/types";
import { getSpinnerFrame } from "../../lib/ui/spinner";
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
      onUpdate: AgentToolUpdateCallback<JesterDetails> | undefined,
      ctx: ExtensionContext,
      signal?: AbortSignal,
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
      const container = new Container();
      container.addChild(
        new Text(theme.fg("toolTitle", theme.bold("Jester")), 0, 0),
      );

      if (args.question) {
        const maxLen = 80;
        const preview =
          args.question.length > maxLen
            ? `${args.question.slice(0, maxLen)}...`
            : args.question;
        container.addChild(
          new Text(`  ${theme.fg("muted", "Q: ")}${preview}`, 0, 0),
        );
      }

      return container;
    },

    renderResult(
      result: AgentToolResult<JesterDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;
      const { expanded, isPartial } = options;

      if (!details) {
        const text = result.content[0];
        const content = text?.type === "text" ? text.text : "";
        return new Text(content || "", 0, 0);
      }

      const {
        response,
        aborted,
        error,
        usage,
        toolCalls,
        resolvedModel,
        spinnerFrame,
      } = details;

      const footer = new SubagentFooter(theme, {
        resolvedModel,
        usage,
        toolCalls,
      });

      if (aborted) {
        const container = new Container();
        container.addChild(new Text(theme.fg("warning", "Aborted"), 0, 0));
        container.addChild(footer);
        return container;
      }

      if (error) {
        const container = new Container();
        container.addChild(
          new Text(theme.fg("error", `Error: ${error}`), 0, 0),
        );
        container.addChild(footer);
        return container;
      }

      if (isPartial) {
        const container = new Container();
        container.addChild(
          new Text(
            theme.fg("muted", `${getSpinnerFrame(spinnerFrame)} jesting...`),
            0,
            0,
          ),
        );
        container.addChild(new Spacer(1));
        container.addChild(footer);
        return container;
      }

      if (!expanded) {
        const container = new Container();
        container.addChild(new Text(theme.fg("success", "✓ done"), 0, 0));
        container.addChild(footer);
        return container;
      }

      const container = new Container();
      if (response) {
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

export async function executeJester(
  input: JesterInput,
  ctx: ExtensionContext,
  onUpdate?: AgentToolUpdateCallback<JesterDetails>,
  signal?: AbortSignal,
): Promise<AgentToolResult<JesterDetails>> {
  const tool = createJesterTool();
  return tool.execute("direct", input, onUpdate, ctx, signal);
}
