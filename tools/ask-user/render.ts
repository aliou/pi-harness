import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Answer, AskUserQuestionDetails, Params, Question } from "./types";

export function renderCall(args: Params, theme: Theme) {
  const count = args.questions?.length ?? 0;
  const plural = count === 1 ? "question" : "questions";
  const headers = args.questions?.map((q: Question) => q.header).join(",");

  return new ToolCallHeader(
    {
      toolName: "Ask User",
      mainArg: `${count} ${plural}`,
      optionArgs: headers ? [{ label: "headers", value: headers }] : undefined,
    },
    theme,
  );
}

export function renderResult(
  result: AgentToolResult<AskUserQuestionDetails>,
  { expanded, isPartial }: ToolRenderResultOptions,
  theme: Theme,
): Text {
  if (isPartial) {
    return new Text(theme.fg("muted", "Waiting for user input..."), 0, 0);
  }

  const { details } = result;

  if (details?.error) {
    if (details.error === "cancelled") {
      if (expanded && details.questions.length) {
        let text = `${theme.fg("error", "✗")} Cancelled, no answer given. Questions asked:\n`;
        details.questions.forEach((q, idx) => {
          const prefix = idx === 0 ? "└ " : "  ";
          text += `\n${prefix}${theme.fg("accent", `[${q.header}]`)} ${theme.fg("toolOutput", q.question)}`;
          q.options.forEach((opt) => {
            text += `\n${theme.fg("dim", "  ○ ")}${theme.fg("muted", opt.label)} ${theme.fg("dim", `— ${opt.description}`)}`;
          });
        });
        return new Text(text, 0, 0);
      }
      return new Text(theme.fg("error", "Cancelled"), 0, 0);
    }
    return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
  }

  if (!details?.answers?.length) {
    const text = result.content[0];
    return new Text(
      text?.type === "text" && text.text ? text.text : "No answers",
      0,
      0,
    );
  }

  const answers = details.answers as Answer[];
  const questions = details.questions as Question[] | undefined;

  if (expanded && questions) {
    let text = `${theme.fg("success", "●")} User answered questions:\n`;

    answers.forEach((answer, idx) => {
      const q = questions[idx];
      const prefix = idx === 0 ? "└ " : "  ";

      text += `\n${prefix}${theme.fg("accent", `[${answer.header}]`)} ${theme.fg("toolOutput", answer.question)}`;

      if (q?.options) {
        q.options.forEach((opt) => {
          const isSelected = answer.selections.includes(opt.label);
          const bullet = isSelected
            ? theme.fg("success", "  ✓ ")
            : theme.fg("dim", "  ○ ");
          const label = isSelected
            ? theme.fg("accent", opt.label)
            : theme.fg("muted", opt.label);
          text += `\n${bullet}${label} ${theme.fg("dim", `— ${opt.description}`)}`;
        });

        const otherSelection = answer.selections.find((s) =>
          s.startsWith("Other:"),
        );
        if (otherSelection) {
          text += `\n${theme.fg("success", "  ✓ ")}${theme.fg("accent", otherSelection)}`;
        }
      }
    });

    return new Text(text, 0, 0);
  }

  let text = `${theme.fg("success", "●")} User answered questions:`;

  answers.forEach((a, idx) => {
    const prefix = idx === 0 ? "\n└  · " : "\n   · ";
    const question = theme.fg("muted", a.question);
    const arrow = " → ";
    const selections = theme.fg("accent", a.selections.join(", "));
    text += prefix + question + arrow + selections;
  });

  return new Text(text, 0, 0);
}
