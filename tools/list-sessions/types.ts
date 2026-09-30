import { SessionSummarySchema } from "@harness/session-store";
import { type Static, Type } from "typebox";

/** `structuredContent` of `list_sessions`: the JSON object sent to the model. */
export const ListSessionsOutputSchema = Type.Object({
  cwd: Type.String(),
  resultCount: Type.Number(),
  results: Type.Array(SessionSummarySchema, {
    description: "Sessions, newest first. Never sets matchedSnippet or score.",
  }),
  error: Type.Optional(
    Type.String({
      description: "Why the listing failed. Set only on error results.",
    }),
  ),
});

export type ListSessionsOutput = Static<typeof ListSessionsOutputSchema>;
