import { type Static, Type } from "typebox";

export const QuestionOptionSchema = Type.Object({
  label: Type.String({
    description: "Option name (1-5 words)",
  }),
  description: Type.String({
    description: "Explanation of this choice with implications/trade-offs",
  }),
});

export const QuestionSchema = Type.Object({
  question: Type.String({
    description: "Complete question text ending with ?",
  }),
  header: Type.String({
    description: "Short label (max 20 chars) shown as chip/tag",
    maxLength: 20,
  }),
  multiSelect: Type.Boolean({
    description:
      "false for mutually exclusive choices, true when multiple selections make sense",
  }),
  options: Type.Array(QuestionOptionSchema, {
    minItems: 2,
    maxItems: 4,
    description: "2-4 distinct choices",
  }),
});

export const AskUserQuestionParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 4,
    description: "1-4 questions to present",
  }),
});

export type QuestionOption = Static<typeof QuestionOptionSchema>;
export type Question = Static<typeof QuestionSchema>;
export type Params = Static<typeof AskUserQuestionParams>;

export const AnswerSchema = Type.Object({
  question: Type.String(),
  header: Type.String(),
  selections: Type.Array(Type.String(), {
    description: "Selected option labels, or custom text entered as Other",
  }),
});

export type Answer = Static<typeof AnswerSchema>;

export interface AskUserQuestionDetails {
  questions: Question[];
  answers: Answer[];
  error?: string;
}

/** `structuredContent` of `ask_user`. */
export const AskUserOutputSchema = Type.Object({
  questions: Type.Array(QuestionSchema),
  answers: Type.Array(AnswerSchema, {
    description: "One answer per question; empty when cancelled or on error",
  }),
  cancelled: Type.Optional(
    Type.Literal(true, { description: "Set when the user dismissed the UI" }),
  ),
  error: Type.Optional(
    Type.String({
      description: "Why no UI could be shown. Set only on error results.",
    }),
  ),
});

export type AskUserOutput = Static<typeof AskUserOutputSchema>;
