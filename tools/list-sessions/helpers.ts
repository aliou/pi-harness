import { type SessionResult, toSessionSummary } from "@harness/session-store";
import { withoutUndefined } from "@harness/utils";
import type { ListSessionsOutput } from "./types";

export function buildListSessionsOutput(
  cwd: string,
  results: SessionResult[],
  error?: string,
): ListSessionsOutput {
  return withoutUndefined({
    cwd,
    resultCount: results.length,
    results: results.map((result) =>
      toSessionSummary({
        ...result,
        matchedSnippet: undefined,
        score: undefined,
      }),
    ),
    error,
  });
}
