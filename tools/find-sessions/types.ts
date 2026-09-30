import { SessionSummarySchema } from "@harness/session-store";
import { type Static, Type } from "typebox";

/** `structuredContent` of `find_sessions`: the JSON object sent to the model. */
export const FindSessionsOutputSchema = Type.Object({
  query: Type.Optional(Type.String()),
  resultCount: Type.Number(),
  results: Type.Array(SessionSummarySchema),
  error: Type.Optional(
    Type.String({
      description: "Why the search failed. Set only on error results.",
    }),
  ),
});

export type FindSessionsOutput = Static<typeof FindSessionsOutputSchema>;
