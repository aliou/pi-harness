import { withoutUndefined } from "@harness/utils";
import type { FindOutput } from "./types";

export function buildFindOutput(
  root: string,
  paths: string[],
  limit: number,
  relativeTo?: string,
): FindOutput {
  return withoutUndefined({
    root,
    paths,
    totalResults: paths.length,
    resultLimitReached: paths.length >= limit,
    relativeTo,
  });
}
