import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { Static } from "@sinclair/typebox";
import { executeAskUserQuestion } from "./execute";
import { renderCall, renderResult } from "./render";
import { AskUserQuestionParams } from "./schema";
import type { AskUserQuestionDetails } from "./types";

export function createTool(
  _pi: ExtensionAPI,
): ToolDefinition<typeof AskUserQuestionParams, AskUserQuestionDetails> {
  return {
    name: "ask_user",
    label: "Ask User",
    description: `Gather user input during task execution through structured multiple-choice questions.
Present 1-4 questions at once, each with 2-4 predefined options.
Users can always choose "Other" to provide custom text (automatic).
Supports single-select or multi-select mode.
Use to clarify requirements, preferences, or implementation choices.`,

    parameters: AskUserQuestionParams,

    async execute(
      _toolCallId: string,
      params: Static<typeof AskUserQuestionParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ) {
      return executeAskUserQuestion(ctx, params);
    },

    renderCall,
    renderResult,
  };
}
