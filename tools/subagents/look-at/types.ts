import { type Static, Type } from "typebox";

export const LookAtParams = Type.Object({
  path: Type.String({
    description: "Path to the image file to analyze (relative or absolute).",
  }),
  objective: Type.String({
    description:
      "Specific visual objective and desired output, e.g. 'extract the exact error text' or 'critique hierarchy and accessibility issues'.",
  }),
  context: Type.Optional(
    Type.String({
      description:
        "Broader product/code/error context, expected state, comparison target, or instructions on what to ignore.",
    }),
  ),
});

export type LookAtParamsInput = Static<typeof LookAtParams>;
