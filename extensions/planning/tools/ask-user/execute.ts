import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import type { AskUserQuestionParams } from "./schema";
import type { Answer, AskUserQuestionDetails, Question } from "./types";

type Params = Static<typeof AskUserQuestionParams>;

interface ExecuteResult {
  content: Array<{ type: "text"; text: string }>;
  details: AskUserQuestionDetails;
}

interface ComponentState {
  mode: "question" | "other-input" | "confirm";
  currentIndex: number;
  highlightIndex: number;
  answers: string[][];
  otherText: string;
  otherCursorPos: number;
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

  const initialAnswers: string[][] = params.questions.map(() => []);
  const state: ComponentState = {
    mode: "question",
    currentIndex: 0,
    highlightIndex: 0,
    answers: initialAnswers,
    otherText: "",
    otherCursorPos: 0,
  };

  const result = await ctx.ui.custom<ExecuteResult | null>(
    (tui, theme, _kb, done) => {
      return {
        render(width: number): string[] {
          if (state.mode === "confirm") {
            return renderConfirmScreen(
              width,
              params.questions,
              state.answers,
              theme,
            );
          }

          if (state.mode === "other-input") {
            return renderOtherInput(width, params.questions, state, theme);
          }

          // mode === "question"
          return renderQuestionScreen(width, params.questions, state, theme);
        },

        invalidate(): void {
          // No-op, we call tui.requestRender() in handleInput
        },

        handleInput(data: string): void {
          if (state.mode === "question") {
            handleQuestionInput(data, state, params.questions, tui, done);
          } else if (state.mode === "other-input") {
            handleOtherInput(data, state, params.questions, tui);
          } else if (state.mode === "confirm") {
            handleConfirmInput(data, state, params, tui, done);
          }
        },
      };
    },
  );

  if (!result) {
    return {
      content: [{ type: "text", text: "User cancelled" }],
      details: { questions: params.questions, answers: [], error: "cancelled" },
    };
  }

  return result;
}

function renderProgressDots(
  theme: Theme,
  currentIndex: number,
  totalQuestions: number,
): string {
  const dots: string[] = [];
  for (let i = 0; i < totalQuestions; i++) {
    if (i < currentIndex) {
      dots.push(theme.fg("success", "●")); // answered
    } else if (i === currentIndex) {
      dots.push(theme.fg("accent", "●")); // current
    } else {
      dots.push(theme.fg("dim", "○")); // unanswered
    }
  }
  return dots.join(" ");
}

function renderQuestionScreen(
  width: number,
  questions: Question[],
  state: ComponentState,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const question = questions[state.currentIndex];
  if (!question) {
    throw new Error(`Invalid current index: ${state.currentIndex}`);
  }

  // Top border with progress
  const progressDots = renderProgressDots(
    theme,
    state.currentIndex,
    questions.length,
  );
  const progressLine = `${theme.fg("border", "╭")}${theme.fg("border", "─")} ${progressDots} ${theme.fg("border", "─".repeat(Math.max(1, width - visibleWidth(progressDots) - 5)))}${theme.fg("border", "╮")}`;
  lines.push(truncateToWidth(progressLine, width));

  // Empty line
  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // Question with header
  const headerStr = theme.fg("accent", `[${question.header}]`);
  const questionStr = theme.fg("text", question.question);
  const headerAndQuestion = `${headerStr} ${questionStr}`;
  const wrappedQuestion = wrapTextWithAnsi(headerAndQuestion, width - 4);

  for (const line of wrappedQuestion) {
    const paddedLine =
      theme.fg("border", "│") +
      " " +
      truncateToWidth(line, width - 4) +
      " ".repeat(Math.max(0, width - 4 - visibleWidth(line))) +
      " " +
      theme.fg("border", "│");
    lines.push(truncateToWidth(paddedLine, width));
  }

  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // Options
  const agentOther = question.options.find(
    (opt) => opt.label.toLowerCase() === "other",
  );
  const regularOptions = question.options
    .filter((opt) => opt.label.toLowerCase() !== "other")
    .map((opt) => ({
      label: opt.label,
      description: opt.description,
      isOther: false,
    }));
  const allOptions = [
    ...regularOptions,
    {
      label: agentOther?.label ?? "Other",
      description: agentOther?.description ?? "Provide custom text",
      isOther: true,
    },
  ];

  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i];
    if (!opt) {
      throw new Error(`Invalid option index: ${i}`);
    }
    const isHighlighted = i === state.highlightIndex;
    const currentAnswers = state.answers[state.currentIndex];
    if (!currentAnswers) {
      throw new Error(
        `Invalid current index for answers: ${state.currentIndex}`,
      );
    }
    const isSelected = opt.isOther
      ? currentAnswers.some((s) => s.startsWith("Other:"))
      : currentAnswers.includes(opt.label);

    // biome-ignore lint/plugin: UI arrow indicator
    const prefix = isHighlighted ? theme.fg("accent", "▶ ") : "  ";
    const checkbox = question.multiSelect
      ? isSelected
        ? theme.fg("success", "[✓]")
        : "[ ]"
      : "";
    const label = isHighlighted
      ? theme.fg("accent", opt.label)
      : isSelected
        ? theme.fg("success", opt.label)
        : theme.fg("text", opt.label);
    const desc = theme.fg("muted", `— ${opt.description}`);

    const checkboxPart = question.multiSelect ? `${checkbox} ` : "";
    const optionLine = `${prefix}${checkboxPart}${label} ${desc}`;
    const wrappedOption = wrapTextWithAnsi(optionLine, width - 4);

    for (let j = 0; j < wrappedOption.length; j++) {
      const wrappedLine = wrappedOption[j];
      if (!wrappedLine) {
        throw new Error(`Invalid wrapped line index: ${j}`);
      }
      const paddedLine =
        theme.fg("border", "│") +
        " " +
        truncateToWidth(wrappedLine, width - 4) +
        " ".repeat(Math.max(0, width - 4 - visibleWidth(wrappedLine))) +
        " " +
        theme.fg("border", "│");
      lines.push(truncateToWidth(paddedLine, width));
    }
  }

  // Bottom border with controls
  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  const controlsText = question.multiSelect
    ? "Space select · Enter next · Tab navigate · Esc cancel"
    : "Enter select · Tab navigate · Esc cancel";
  const controlsLine =
    theme.fg("border", "├") +
    theme.fg("border", "─".repeat(Math.max(1, width - 2))) +
    theme.fg("border", "┤");
  lines.push(truncateToWidth(controlsLine, width));

  const controlsPadded =
    theme.fg("border", "│") +
    " " +
    truncateToWidth(theme.fg("dim", controlsText), width - 4) +
    " ".repeat(Math.max(0, width - 4 - visibleWidth(controlsText))) +
    " " +
    theme.fg("border", "│");
  lines.push(truncateToWidth(controlsPadded, width));

  lines.push(
    theme.fg("border", "╰") +
      theme.fg("border", "─".repeat(Math.max(1, width - 2))) +
      theme.fg("border", "╯"),
  );

  return lines;
}

function renderOtherInput(
  width: number,
  questions: Question[],
  state: ComponentState,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const question = questions[state.currentIndex];
  if (!question) {
    throw new Error(`Invalid current index: ${state.currentIndex}`);
  }

  // Top border with progress
  const progressDots = renderProgressDots(
    theme,
    state.currentIndex,
    questions.length,
  );
  const progressLine = `${theme.fg("border", "╭")}${theme.fg("border", "─")} ${progressDots} ${theme.fg("border", "─".repeat(Math.max(1, width - visibleWidth(progressDots) - 5)))}${theme.fg("border", "╮")}`;
  lines.push(truncateToWidth(progressLine, width));

  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // Question header
  const headerStr = theme.fg("accent", `[${question.header}]`);
  const questionStr = theme.fg("text", question.question);
  const headerAndQuestion = `${headerStr} ${questionStr}`;
  const wrappedQuestion = wrapTextWithAnsi(headerAndQuestion, width - 4);

  for (const line of wrappedQuestion) {
    const paddedLine =
      theme.fg("border", "│") +
      " " +
      truncateToWidth(line, width - 4) +
      " ".repeat(Math.max(0, width - 4 - visibleWidth(line))) +
      " " +
      theme.fg("border", "│");
    lines.push(truncateToWidth(paddedLine, width));
  }

  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // "Other" input prompt with cursor and wrapping
  const prefix = theme.fg("warning", "Other: ");
  const contentWidth = width - 4; // │ + space + ... + space + │
  const beforeCursor = state.otherText.slice(0, state.otherCursorPos);
  const afterCursor = state.otherText.slice(state.otherCursorPos);
  const cursorCharRaw = afterCursor[0];
  const cursorChar = cursorCharRaw !== undefined ? cursorCharRaw : " ";
  const afterCursorRest = afterCursor.length > 0 ? afterCursor.slice(1) : "";
  const inputDisplay = `${beforeCursor}\x1b[7m${cursorChar}\x1b[27m${afterCursorRest}`;

  // Wrap the input text if it exceeds available width
  const fullInput = prefix + inputDisplay;
  const wrappedInput = wrapTextWithAnsi(fullInput, contentWidth);

  for (const inputLine of wrappedInput) {
    const padNeeded = Math.max(0, contentWidth - visibleWidth(inputLine));
    const paddedLine =
      theme.fg("border", "│") +
      " " +
      inputLine +
      " ".repeat(padNeeded) +
      " " +
      theme.fg("border", "│");
    lines.push(truncateToWidth(paddedLine, width));
  }

  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // Bottom border
  lines.push(
    theme.fg("border", "├") +
      theme.fg("border", "─".repeat(Math.max(1, width - 2))) +
      theme.fg("border", "┤"),
  );

  const controlsText = "Enter confirm · Esc cancel";
  const controlsPadded =
    theme.fg("border", "│") +
    " " +
    truncateToWidth(theme.fg("dim", controlsText), width - 4) +
    " ".repeat(Math.max(0, width - 4 - visibleWidth(controlsText))) +
    " " +
    theme.fg("border", "│");
  lines.push(truncateToWidth(controlsPadded, width));

  lines.push(
    theme.fg("border", "╰") +
      theme.fg("border", "─".repeat(Math.max(1, width - 2))) +
      theme.fg("border", "╯"),
  );

  return lines;
}

function renderConfirmScreen(
  width: number,
  questions: Question[],
  answers: string[][],
  theme: Theme,
): string[] {
  const lines: string[] = [];

  // Top border
  lines.push(
    theme.fg("border", "╭") +
      theme.fg("border", "─ Review ") +
      theme.fg("border", "─".repeat(Math.max(1, width - 11))) +
      theme.fg("border", "╮"),
  );

  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // Show all answers
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) {
      throw new Error(`Invalid question index: ${i}`);
    }
    const ans = answers[i] ?? [];

    // Question line
    const headerStr = theme.fg("accent", `[${q.header}]`);
    const questionStr = theme.fg("text", q.question);
    const headerAndQuestion = `${headerStr} ${questionStr}`;
    const wrappedQuestion = wrapTextWithAnsi(headerAndQuestion, width - 4);

    for (const line of wrappedQuestion) {
      const paddedLine =
        theme.fg("border", "│") +
        " " +
        truncateToWidth(line, width - 4) +
        " ".repeat(Math.max(0, width - 4 - visibleWidth(line))) +
        " " +
        theme.fg("border", "│");
      lines.push(truncateToWidth(paddedLine, width));
    }

    // Answer line
    const answerStr = ans.length > 0 ? ans.join(", ") : "(none)";
    const answerLine =
      theme.fg("success", "→ ") + theme.fg("accent", answerStr);
    const wrappedAnswer = wrapTextWithAnsi(answerLine, width - 4);

    for (const line of wrappedAnswer) {
      const paddedLine =
        theme.fg("border", "│") +
        " " +
        truncateToWidth(line, width - 4) +
        " ".repeat(Math.max(0, width - 4 - visibleWidth(line))) +
        " " +
        theme.fg("border", "│");
      lines.push(truncateToWidth(paddedLine, width));
    }

    if (i < questions.length - 1) {
      lines.push(
        theme.fg("border", "│") +
          " ".repeat(Math.max(0, width - 2)) +
          theme.fg("border", "│"),
      );
    }
  }

  lines.push(
    theme.fg("border", "│") +
      " ".repeat(Math.max(0, width - 2)) +
      theme.fg("border", "│"),
  );

  // Bottom border
  lines.push(
    theme.fg("border", "├") +
      theme.fg("border", "─".repeat(Math.max(1, width - 2))) +
      theme.fg("border", "┤"),
  );

  const controlsText = "Enter submit · Esc go back";
  const controlsPadded =
    theme.fg("border", "│") +
    " " +
    truncateToWidth(theme.fg("dim", controlsText), width - 4) +
    " ".repeat(Math.max(0, width - 4 - visibleWidth(controlsText))) +
    " " +
    theme.fg("border", "│");
  lines.push(truncateToWidth(controlsPadded, width));

  lines.push(
    theme.fg("border", "╰") +
      theme.fg("border", "─".repeat(Math.max(1, width - 2))) +
      theme.fg("border", "╯"),
  );

  return lines;
}

function handleQuestionInput(
  data: string,
  state: ComponentState,
  questions: Question[],
  tui: { requestRender: () => void },
  done: (result: ExecuteResult | null) => void,
): void {
  const question = questions[state.currentIndex];
  if (!question) {
    throw new Error(`Invalid current index: ${state.currentIndex}`);
  }
  const agentOther = question.options.find(
    (opt) => opt.label.toLowerCase() === "other",
  );
  const regularOptions = question.options.filter(
    (opt) => opt.label.toLowerCase() !== "other",
  );
  const allOptions = [
    ...regularOptions.map((opt) => ({ ...opt, isOther: false })),
    {
      label: agentOther?.label ?? "Other",
      description: agentOther?.description ?? "Provide custom text",
      isOther: true,
    },
  ];

  if (matchesKey(data, Key.escape)) {
    done(null);
    return;
  }

  if (matchesKey(data, Key.tab)) {
    state.currentIndex = (state.currentIndex + 1) % questions.length;
    state.highlightIndex = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.shift("tab"))) {
    state.currentIndex =
      (state.currentIndex - 1 + questions.length) % questions.length;
    state.highlightIndex = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.up)) {
    state.highlightIndex =
      (state.highlightIndex - 1 + allOptions.length) % allOptions.length;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.down)) {
    state.highlightIndex = (state.highlightIndex + 1) % allOptions.length;
    tui.requestRender();
    return;
  }

  if (question.multiSelect && matchesKey(data, Key.space)) {
    const highlighted = allOptions[state.highlightIndex];
    if (!highlighted) {
      throw new Error(`Invalid highlight index: ${state.highlightIndex}`);
    }

    const currentAnswers = state.answers[state.currentIndex];
    if (!currentAnswers) {
      throw new Error(
        `Invalid current index for answers: ${state.currentIndex}`,
      );
    }

    if (highlighted.isOther) {
      // Check if Other is already selected
      const hasOther = currentAnswers.some((s) => s.startsWith("Other:"));
      if (hasOther) {
        // Deselect Other
        state.answers[state.currentIndex] = currentAnswers.filter(
          (s) => !s.startsWith("Other:"),
        );
      } else {
        // Open input for Other
        state.mode = "other-input";
        state.otherText = "";
        state.otherCursorPos = 0;
      }
    } else {
      const idx = currentAnswers.indexOf(highlighted.label);
      if (idx >= 0) {
        currentAnswers.splice(idx, 1);
      } else {
        currentAnswers.push(highlighted.label);
      }
    }
    tui.requestRender();
    return;
  }

  if (!question.multiSelect && matchesKey(data, Key.enter)) {
    const highlighted = allOptions[state.highlightIndex];
    if (!highlighted) {
      throw new Error(`Invalid highlight index: ${state.highlightIndex}`);
    }

    if (highlighted.isOther) {
      state.mode = "other-input";
      state.otherText = "";
      state.otherCursorPos = 0;
    } else {
      state.answers[state.currentIndex] = [highlighted.label];
      moveToNextQuestion(state, questions);
    }
    tui.requestRender();
    return;
  }

  if (question.multiSelect && matchesKey(data, Key.enter)) {
    const currentAnswers = state.answers[state.currentIndex];
    if (!currentAnswers) {
      throw new Error(
        `Invalid current index for answers: ${state.currentIndex}`,
      );
    }
    if (currentAnswers.length === 0) {
      state.answers[state.currentIndex] = ["(none)"];
    }
    moveToNextQuestion(state, questions);
    tui.requestRender();
    return;
  }
}

function handleOtherInput(
  data: string,
  state: ComponentState,
  questions: Question[],
  tui: { requestRender: () => void },
): void {
  if (matchesKey(data, Key.escape)) {
    state.mode = "question";
    state.otherText = "";
    state.otherCursorPos = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.enter)) {
    const currentAnswers = state.answers[state.currentIndex];
    if (!currentAnswers) {
      throw new Error(
        `Invalid current index for answers: ${state.currentIndex}`,
      );
    }
    if (state.otherText.trim()) {
      currentAnswers.push(`Other: ${state.otherText}`);
    }
    state.otherText = "";
    state.otherCursorPos = 0;

    const question = questions[state.currentIndex];
    if (!question) {
      throw new Error(`Invalid current index: ${state.currentIndex}`);
    }
    if (!question.multiSelect) {
      // Single-select: advance to next question
      state.mode = "question";
      moveToNextQuestion(state, questions);
    } else {
      state.mode = "question";
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.backspace)) {
    if (state.otherCursorPos > 0) {
      state.otherText =
        state.otherText.slice(0, state.otherCursorPos - 1) +
        state.otherText.slice(state.otherCursorPos);
      state.otherCursorPos--;
    }
    tui.requestRender();
    return;
  }

  // ctrl-a: beginning of line
  if (matchesKey(data, Key.ctrl("a")) || matchesKey(data, Key.home)) {
    state.otherCursorPos = 0;
    tui.requestRender();
    return;
  }

  // ctrl-e: end of line
  if (matchesKey(data, Key.ctrl("e")) || matchesKey(data, Key.end)) {
    state.otherCursorPos = state.otherText.length;
    tui.requestRender();
    return;
  }

  // ctrl-w: delete word backward
  if (matchesKey(data, Key.ctrl("w"))) {
    const before = state.otherText.slice(0, state.otherCursorPos);
    const trimmed = before.replace(/\s+$/, "");
    const lastSpace = trimmed.lastIndexOf(" ");
    const newPos = lastSpace === -1 ? 0 : lastSpace + 1;
    state.otherText =
      state.otherText.slice(0, newPos) +
      state.otherText.slice(state.otherCursorPos);
    state.otherCursorPos = newPos;
    tui.requestRender();
    return;
  }

  // ctrl-u: delete to beginning of line
  if (matchesKey(data, Key.ctrl("u"))) {
    state.otherText = state.otherText.slice(state.otherCursorPos);
    state.otherCursorPos = 0;
    tui.requestRender();
    return;
  }

  // ctrl-k: delete to end of line
  if (matchesKey(data, Key.ctrl("k"))) {
    state.otherText = state.otherText.slice(0, state.otherCursorPos);
    tui.requestRender();
    return;
  }

  // left/right arrow
  if (matchesKey(data, Key.left)) {
    if (state.otherCursorPos > 0) state.otherCursorPos--;
    tui.requestRender();
    return;
  }
  if (matchesKey(data, Key.right)) {
    if (state.otherCursorPos < state.otherText.length) state.otherCursorPos++;
    tui.requestRender();
    return;
  }

  // Accept printable input (single chars or pasted text)
  // Filter out control characters
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally filtering control chars
  const printable = data.replace(/[\x00-\x1f\x7f]/g, "");
  if (printable.length > 0) {
    state.otherText =
      state.otherText.slice(0, state.otherCursorPos) +
      printable +
      state.otherText.slice(state.otherCursorPos);
    state.otherCursorPos += printable.length;
    tui.requestRender();
    return;
  }
}

function handleConfirmInput(
  data: string,
  state: ComponentState,
  params: Params,
  tui: { requestRender: () => void },
  done: (result: ExecuteResult | null) => void,
): void {
  if (matchesKey(data, Key.escape)) {
    state.mode = "question";
    state.currentIndex = params.questions.length - 1;
    state.highlightIndex = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.enter)) {
    // Format and submit
    const answers: Answer[] = params.questions.map((q, idx) => ({
      question: q.question,
      header: q.header,
      selections: state.answers[idx] ?? [],
    }));

    const responseText = answers
      .map(
        (a) =>
          `${a.header}: ${a.question}\nSelected: ${a.selections.join(", ")}`,
      )
      .join("\n\n");

    done({
      content: [{ type: "text", text: responseText }],
      details: { questions: params.questions, answers },
    });
    return;
  }
}

function moveToNextQuestion(
  state: ComponentState,
  questions: Question[],
): void {
  if (state.currentIndex < questions.length - 1) {
    state.currentIndex++;
    state.highlightIndex = 0;
  } else {
    // Move to confirm screen
    state.mode = "confirm";
  }
}
