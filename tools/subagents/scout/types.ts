import { type Static, Type } from "typebox";

export const ScoutParams = Type.Object({
  query: Type.String({
    description:
      "Self-contained local codebase question. Include the feature/symbol/behavior, relevant paths, and desired answer shape.",
  }),
  context: Type.Optional(
    Type.String({
      description:
        "Optional context: prior findings, errors, constraints, what has already been searched, or why the answer matters.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Local codebase root to inspect. Defaults to the current working directory; pass an explicit path when researching another local repo.",
    }),
  ),
});

export type ScoutParamsType = Static<typeof ScoutParams>;
