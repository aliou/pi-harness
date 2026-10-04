import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";

export const AdvisorStage = StringEnum([
  "before_approach",
  "stuck",
  "change_of_approach",
  "pre_completion",
  "risk_review",
  "general",
] as const);

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
