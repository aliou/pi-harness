import { type Static, Type } from "typebox";

export const AdvisorStage = Type.Union([
  Type.Literal("before_approach"),
  Type.Literal("stuck"),
  Type.Literal("change_of_approach"),
  Type.Literal("pre_completion"),
  Type.Literal("risk_review"),
  Type.Literal("general"),
]);

export const AdvisorParams = Type.Object({
  task: Type.String({
    description:
      "Self-contained advisory task or decision. Include the outcome, scope, constraints, available evidence, verification signal, final response shape, and what decision the main agent needs.",
  }),
  stage: Type.Optional(AdvisorStage),
  context: Type.Optional(
    Type.String({
      description:
        "Optional relevant context: transcript summary, evidence gathered, tool results, attempted approaches, failures, constraints, acceptance criteria, or verified gaps.",
    }),
  ),
  proposal: Type.Optional(
    Type.String({
      description:
        "Optional current plan, interpretation, or conclusion for the advisor to critique or confirm.",
    }),
  ),
  files: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Optional concrete files or paths the advisor should inspect before making file-specific claims.",
      }),
    ),
  ),
});

export type AdvisorParamsType = Static<typeof AdvisorParams>;
