import { type Static, Type } from "typebox";

export const ReviewerParams = Type.Object({
  diff_description: Type.String({
    description:
      "Exact diff description or command to review from the current cwd, e.g. 'git diff --staged' or 'git diff main...HEAD'.",
  }),
  instructions: Type.Optional(
    Type.String({
      description:
        "Optional focused review criteria: risk areas, invariants, expected behavior, verification signal, severity threshold, or files to scrutinize.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Local repository root where the review should run. Defaults to the current working directory; pass this when reviewing another repo or path.",
    }),
  ),
});

export type ReviewerParamsType = Static<typeof ReviewerParams>;
