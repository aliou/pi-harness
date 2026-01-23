import { Type } from "@sinclair/typebox";

export const QuestionSchema = Type.Object({
  question: Type.String({
    description: "Complete question text ending with ?",
  }),
  header: Type.String({
    description: "Short label (max 12 chars) shown as chip/tag",
    maxLength: 12,
  }),
  multiSelect: Type.Boolean({
    description:
      "false for mutually exclusive choices, true when multiple selections make sense",
  }),
  options: Type.Array(
    Type.Object({
      label: Type.String({
        description: "Option name (1-5 words)",
      }),
      description: Type.String({
        description: "Explanation of this choice with implications/trade-offs",
      }),
    }),
    {
      minItems: 2,
      maxItems: 4,
      description: "2-4 distinct choices",
    },
  ),
});

export const AskUserQuestionParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 4,
    description: "1-4 questions to present",
  }),
});
