import { type Static, Type } from "typebox";

export const OracleParams = Type.Object({
  task: Type.String({
    description:
      "Self-contained task or question. Include the outcome, what good means, constraints, verification signal, decision needed, and expected output.",
  }),
  context: Type.Optional(
    Type.String({
      description:
        "Optional background context: repo/project details, prior findings, options considered, acceptance criteria, or risk areas.",
    }),
  ),
  files: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Optional concrete files or paths the oracle should inspect before giving file-specific advice.",
      }),
    ),
  ),
});

export type OracleParamsType = Static<typeof OracleParams>;
