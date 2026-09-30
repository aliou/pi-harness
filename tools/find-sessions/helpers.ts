import { type SessionResult, toSessionSummary } from "@harness/session-store";
import { withoutUndefined } from "@harness/utils";
import type { FindSessionsOutput } from "./types";

export function buildFindSessionsOutput(
  query: string | undefined,
  results: SessionResult[],
  error?: string,
): FindSessionsOutput {
  return withoutUndefined({
    query,
    resultCount: results.length,
    results: results.map(toSessionSummary),
    error,
  });
}
