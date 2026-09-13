/**
 * Args-time diff preview for `apply_patch`.
 *
 * Mirrors pi's native edit renderer: once the streamed patch arguments are
 * complete (before the tool executes), parse the finished patch and compute
 * the diff it would produce against the current files on disk. The call
 * component shows that preview while execution runs, instead of sitting on a
 * static file-op count.
 *
 * The preview is best-effort: files that cannot be read or matched are skipped
 * so a single unreadable path never hides the rest of the diff.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { generateDiffString } from "@earendil-works/pi-coding-agent";

import { deriveNewContents } from "./apply";
import { parsePatch } from "./parser";
import type { ApplyPatchFileDiff } from "./tool";
import type { Hunk } from "./types";

export type ApplyPatchPreview =
  | { error: string }
  | { fileDiffs: ApplyPatchFileDiff[] };

/** Parse the finished patch and derive per-file diffs against disk. */
export async function computePatchPreview(
  patch: string,
  cwd: string,
  readFileFn: (path: string) => Promise<string | null> = readPreviewFile,
): Promise<ApplyPatchPreview> {
  let hunks: Hunk[];
  try {
    hunks = parsePatch(patch).hunks;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const fileDiffs: ApplyPatchFileDiff[] = [];
  for (const hunk of hunks) {
    const diff = await previewHunk(hunk, cwd, readFileFn);
    if (diff) fileDiffs.push(diff);
  }
  return { fileDiffs };
}

async function previewHunk(
  hunk: Hunk,
  cwd: string,
  readFileFn: (path: string) => Promise<string | null>,
): Promise<ApplyPatchFileDiff | undefined> {
  try {
    if (hunk.type === "add") {
      return fileDiff(hunk.path, "", hunk.contents);
    }
    const before = await readFileFn(resolve(cwd, hunk.path));
    if (before === null) return undefined;
    if (hunk.type === "delete") {
      return fileDiff(hunk.path, before, "");
    }
    const after = deriveNewContents(before, hunk.chunks, hunk.path);
    return fileDiff(hunk.movePath ?? hunk.path, before, after);
  } catch {
    return undefined;
  }
}

function fileDiff(
  path: string,
  before: string,
  after: string,
): ApplyPatchFileDiff {
  const status: ApplyPatchFileDiff["status"] = !before
    ? "A"
    : !after
      ? "D"
      : "M";
  const { diff } = generateDiffString(before, after);
  return { status, path, diff };
}

/** File reader used by the renderer-injected preview; overridable in tests. */
export const previewFileReader: {
  read: (path: string) => Promise<string | null>;
} = { read: readPreviewFile };

async function readPreviewFile(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch {
    return null;
  }
}
