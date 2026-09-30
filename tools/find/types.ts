import type { FindToolDetails } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

export interface HarnessFindDetails extends FindToolDetails {
  relativeTo?: string;
  totalResults?: number;
  paths?: string[];
}

/** `structuredContent` of `find`: the same paths the model receives. */
export const FindOutputSchema = Type.Object({
  root: Type.String({
    description: "Absolute directory that relative `paths` are relative to",
  }),
  paths: Type.Array(Type.String(), {
    description:
      "Matching paths, relative to `root` when inside it, otherwise absolute",
  }),
  totalResults: Type.Number(),
  resultLimitReached: Type.Boolean({
    description:
      "Whether the result count reached `limit`, so more matches may exist",
  }),
  relativeTo: Type.Optional(
    Type.String({
      description:
        "`root` relative to the session cwd, when a non-default path was searched",
    }),
  ),
});

export type FindOutput = Static<typeof FindOutputSchema>;
