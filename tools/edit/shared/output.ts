/**
 * `structuredContent` schemas for the edit tool family. Both `edit`
 * definitions (default and Kimi) share one output shape.
 */

import { withoutUndefined } from "@harness/utils";
import { type Static, Type } from "typebox";

export const EDIT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const EditOutputSchema = Type.Object({
  path: Type.String({ description: "Edited path, as passed in the call" }),
  replacementCount: Type.Number({
    description: "Number of replaced occurrences",
  }),
  firstChangedLine: Type.Optional(
    Type.Number({ description: "First changed line in the new file" }),
  ),
});

export type EditOutput = Static<typeof EditOutputSchema>;

export function buildEditOutput(
  path: string,
  replacementCount: number,
  firstChangedLine: number | undefined,
): EditOutput {
  return withoutUndefined({ path, replacementCount, firstChangedLine });
}

/** Paths an `apply_patch` call changed, by kind. */
export const ApplyPatchOutputSchema = Type.Object({
  added: Type.Array(Type.String()),
  modified: Type.Array(Type.String()),
  deleted: Type.Array(Type.String()),
  overwritten: Type.Array(Type.String(), {
    description:
      "Paths that existed before the patch and were replaced by an Add File or Move to",
  }),
});

export type ApplyPatchOutput = Static<typeof ApplyPatchOutputSchema>;
