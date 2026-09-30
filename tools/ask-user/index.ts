import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { answeredResult, cancelledResult, unavailableResult } from "./helpers";
import { renderCall, renderResult } from "./render";
import { AskUserOutputSchema, AskUserQuestionParams } from "./types";
import { runAskUserUI } from "./ui";

const DESCRIPTION = `Gather user input through structured multiple-choice questions.

Present 1-4 questions, each with 2-4 predefined options.
Users can always choose "Other" to provide custom text.
Supports single-select or multi-select mode.

WHEN TO USE:
- Genuine ambiguity where no option is clearly better
- Irreversible actions (destructive changes, publishing, deploying)
- User explicitly asked to be consulted before deciding
- Multiple valid architectural approaches with real trade-offs

WHEN NOT TO USE:
- You can make a reasonable default choice -- just do it
- Low-stakes decisions (formatting, variable names, file organization)
- Yes/no confirmations for routine actions
- Information you could find by reading the codebase or docs

Prefer making a decision and letting the user correct you over asking. Most questions slow the user down more than a wrong guess.`;

const PROMPT_GUIDELINES = [
  "ask_user: Use when there is genuine ambiguity and no option is clearly better.",
  "ask_user: Use for irreversible actions (destructive changes, publishing, deploying).",
  "ask_user: Do not use when you can make a reasonable default choice -- just do it.",
  "ask_user: Do not use for low-stakes decisions or yes/no confirmations for routine actions.",
  "ask_user: Prefer making a decision and letting the user correct you over asking.",
];

export const askUserTool = defineTool({
  name: "ask_user",
  label: "Ask User",
  description: DESCRIPTION,
  promptSnippet:
    "Ask the user to choose between options (structured questions)",
  parameters: AskUserQuestionParams,
  promptGuidelines: PROMPT_GUIDELINES,
  outputSchema: AskUserOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  executionMode: "sequential",

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    if (!ctx.hasUI) {
      return unavailableResult(
        params.questions,
        "Error: UI not available (running in non-interactive mode)",
        "UI not available",
      );
    }

    const uiResult = await runAskUserUI(ctx, params);

    if (uiResult === undefined) {
      return unavailableResult(
        params.questions,
        `Error: ask_user custom UI is not available in ${ctx.mode} mode`,
        `custom UI not available in ${ctx.mode} mode`,
      );
    }

    if (uiResult === null) {
      return cancelledResult(params.questions);
    }

    return answeredResult(uiResult);
  },

  renderCall,
  renderResult,
});

export default function (pi: ExtensionAPI): void {
  pi.registerTool(askUserTool);
}
