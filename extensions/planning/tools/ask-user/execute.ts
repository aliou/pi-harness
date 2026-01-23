import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Static } from "@sinclair/typebox";
import type { AskUserQuestionParams } from "./schema";
import type { Answer, AskUserQuestionDetails } from "./types";

type Params = Static<typeof AskUserQuestionParams>;

interface ExecuteResult {
  content: Array<{ type: "text"; text: string }>;
  details: AskUserQuestionDetails;
}

export async function executeAskUserQuestion(
  ctx: ExtensionContext,
  params: Params,
): Promise<ExecuteResult> {
  if (!ctx.hasUI) {
    return {
      content: [
        {
          type: "text",
          text: "Error: UI not available (running in non-interactive mode)",
        },
      ],
      details: {
        questions: params.questions,
        answers: [],
        error: "UI not available",
      },
    };
  }

  const answers: Answer[] = [];

  for (const question of params.questions) {
    const optionLabels = question.options.map(
      (opt) => `${opt.label} — ${opt.description}`,
    );
    optionLabels.push("Other — Provide custom text");

    if (question.multiSelect) {
      const selections: string[] = [];
      let keepSelecting = true;

      while (keepSelecting) {
        const checkboxOptions = question.options.map((opt) => {
          const isSelected = selections.includes(opt.label);
          const checkbox = isSelected ? "[✓]" : "[ ]";
          return `${checkbox} ${opt.label} — ${opt.description}`;
        });

        const hasOther = selections.some((s) => s.startsWith("Other:"));
        checkboxOptions.push(
          hasOther
            ? "[✓] Other — Provide custom text"
            : "[ ] Other — Provide custom text",
        );
        checkboxOptions.push("Submit");

        const selected = await ctx.ui.select(
          `${question.header}: ${question.question}`,
          checkboxOptions,
        );

        if (!selected) {
          return {
            content: [{ type: "text", text: "User cancelled the selection" }],
            details: {
              questions: params.questions,
              answers,
              error: "cancelled",
            },
          };
        }

        if (selected === "Submit") {
          keepSelecting = false;
        } else if (selected.includes("Other")) {
          const existingOther = selections.findIndex((s) =>
            s.startsWith("Other:"),
          );
          if (existingOther >= 0) {
            selections.splice(existingOther, 1);
          } else {
            const customText = await ctx.ui.input(question.question);
            if (customText) {
              selections.push(`Other: ${customText}`);
            }
          }
        } else {
          const label = selected.replace(/^\[.\] /, "").split(" — ")[0] ?? "";
          const idx = selections.indexOf(label);
          if (idx >= 0) {
            selections.splice(idx, 1);
          } else {
            selections.push(label);
          }
        }
      }

      answers.push({
        question: question.question,
        header: question.header,
        selections: selections.length > 0 ? selections : ["(none)"],
      });
    } else {
      const selected = await ctx.ui.select(
        `${question.header}: ${question.question}`,
        optionLabels,
      );

      if (!selected) {
        return {
          content: [{ type: "text", text: "User cancelled the selection" }],
          details: { questions: params.questions, answers, error: "cancelled" },
        };
      }

      let selection: string;
      if (selected.startsWith("Other")) {
        const customText = await ctx.ui.input(question.question);
        if (!customText) {
          return {
            content: [{ type: "text", text: "User cancelled the input" }],
            details: {
              questions: params.questions,
              answers,
              error: "cancelled",
            },
          };
        }
        selection = `Other: ${customText}`;
      } else {
        selection = selected.split(" — ")[0] ?? "";
      }

      answers.push({
        question: question.question,
        header: question.header,
        selections: [selection],
      });
    }
  }

  const reviewSummary = answers
    .map((a) => `● ${a.question}\n  → ${a.selections.join(", ")}`)
    .join("\n");

  const reviewChoice = await ctx.ui.select(
    `Review your answers:\n\n${reviewSummary}\n`,
    ["Submit answers", "Cancel"],
  );

  if (!reviewChoice || reviewChoice === "Cancel") {
    return {
      content: [{ type: "text", text: "User cancelled after review" }],
      details: { questions: params.questions, answers, error: "cancelled" },
    };
  }

  const responseText = answers
    .map(
      (a) => `${a.header}: ${a.question}\nSelected: ${a.selections.join(", ")}`,
    )
    .join("\n\n");

  return {
    content: [{ type: "text", text: responseText }],
    details: { questions: params.questions, answers },
  };
}
