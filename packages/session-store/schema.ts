import { withoutUndefined } from "@harness/utils";
import { type Static, Type } from "typebox";
import type { SessionResult } from "./types";

/**
 * JSON shape of one session in the `find_sessions` and `list_sessions` tool
 * output. `matchedSnippet` and `score` are only set by keyword search.
 */
export const SessionSummarySchema = Type.Object({
  id: Type.String(),
  path: Type.String({ description: "Session file path" }),
  cwd: Type.String({ description: "Working directory of the session" }),
  name: Type.Optional(Type.String()),
  created: Type.String({ description: "ISO timestamp" }),
  modified: Type.String({ description: "ISO timestamp" }),
  messageCount: Type.Number(),
  matchedSnippet: Type.Optional(Type.String()),
  score: Type.Optional(Type.Number()),
  matchMode: Type.Union([
    Type.Literal("all"),
    Type.Literal("any"),
    Type.Literal("browse"),
  ]),
  matchedType: Type.Union([Type.String(), Type.Null()]),
  matchedEntryId: Type.Union([Type.String(), Type.Null()]),
  matchedAt: Type.Union([Type.String(), Type.Null()]),
});

export type SessionSummary = Static<typeof SessionSummarySchema>;

/** Session fields exposed by the session tools, in their output order. */
export function toSessionSummary(result: SessionResult): SessionSummary {
  return withoutUndefined({
    id: result.id,
    path: result.path,
    cwd: result.cwd,
    name: result.name,
    created: result.created,
    modified: result.modified,
    messageCount: result.messageCount,
    matchedSnippet: result.matchedSnippet,
    score: result.score,
    matchMode: result.matchMode,
    matchedType: result.matchedType,
    matchedEntryId: result.matchedEntryId,
    matchedAt: result.matchedAt,
  });
}
