import { join } from "node:path";
import { executeToolDefinition } from "@harness/test-utils/pi-context";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyHunks, deriveNewContents } from "./apply";
import { ApplyPatchParseError, parsePatch } from "./parser";
import { createApplyPatchToolDefinition } from "./tool";
import type { ApplyPatchResult } from "./types";

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

describe("deriveNewContents", () => {
  it("replaces a single line", () => {
    expect(
      deriveNewContents(
        "foo\nbar\nbaz\n",
        [
          {
            changeContext: null,
            oldLines: ["bar"],
            newLines: ["BAR"],
            isEndOfFile: false,
          },
        ],
        "f",
      ),
    ).toBe("foo\nBAR\nbaz\n");
  });

  it("applies multiple chunks in one file", () => {
    expect(
      deriveNewContents(
        "foo\nbar\nbaz\nqux\n",
        [
          {
            changeContext: null,
            oldLines: ["foo", "bar"],
            newLines: ["foo", "BAR"],
            isEndOfFile: false,
          },
          {
            changeContext: null,
            oldLines: ["baz", "qux"],
            newLines: ["baz", "QUX"],
            isEndOfFile: false,
          },
        ],
        "f",
      ),
    ).toBe("foo\nBAR\nbaz\nQUX\n");
  });

  it("appends at end of file", () => {
    expect(
      deriveNewContents(
        "foo\nbar\nbaz\n",
        [
          {
            changeContext: null,
            oldLines: [],
            newLines: ["quux"],
            isEndOfFile: true,
          },
        ],
        "f",
      ),
    ).toBe("foo\nbar\nbaz\nquux\n");
  });

  it("matches context lines with fuzzy unicode normalization", () => {
    const original =
      "import asyncio  # local import \u2013 avoids top\u2011level dep\n";
    expect(
      deriveNewContents(
        original,
        [
          {
            changeContext: null,
            oldLines: ["import asyncio  # local import - avoids top-level dep"],
            newLines: ["import asyncio  # HELLO"],
            isEndOfFile: false,
          },
        ],
        "f",
      ),
    ).toBe("import asyncio  # HELLO\n");
  });

  it("throws when expected lines are not found", () => {
    expect(() =>
      deriveNewContents(
        "foo\nbar\n",
        [
          {
            changeContext: null,
            oldLines: ["missing"],
            newLines: ["x"],
            isEndOfFile: false,
          },
        ],
        "f",
      ),
    ).toThrow(/Failed to find expected lines in f:/);
  });
});

describe("applyHunks", () => {
  const cwd = "/tmp/proj";

  beforeEach(() => {
    vol.mkdirSync(cwd, { recursive: true });
  });

  it("creates a new file (Add File)", async () => {
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Add File: src/new.txt\n+hello\n+world\n*** End Patch",
    );
    const result = await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "src/new.txt"), "utf8")).toBe(
      "hello\nworld\n",
    );
    expect(result.summary).toContain("A src/new.txt");
  });

  it("deletes an existing file", async () => {
    vol.writeFileSync(join(cwd, "old.txt"), "x\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Delete File: old.txt\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.existsSync(join(cwd, "old.txt"))).toBe(false);
  });

  it("updates a file in place", async () => {
    vol.writeFileSync(join(cwd, "u.txt"), "foo\nbar\nbaz\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: u.txt\n@@\n foo\n-bar\n+baz2\n*** End Patch",
    );
    const result = await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "u.txt"), "utf8")).toBe(
      "foo\nbaz2\nbaz\n",
    );
    expect(result.summary).toContain("M u.txt");
  });

  it("moves a file via *** Move to", async () => {
    vol.writeFileSync(join(cwd, "src.txt"), "line\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: src.txt\n*** Move to: dst.txt\n@@\n-line\n+line2\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.existsSync(join(cwd, "src.txt"))).toBe(false);
    expect(vol.readFileSync(join(cwd, "dst.txt"), "utf8")).toBe("line2\n");
  });

  it("rejects deleting a directory", async () => {
    vol.mkdirSync(join(cwd, "adir"), { recursive: true });
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Delete File: adir\n*** End Patch",
    );
    await expect(applyHunks(hunks, cwd)).rejects.toThrow(/is a directory/);
  });

  it("throws when there are no hunks", async () => {
    await expect(applyHunks([], cwd)).rejects.toThrow(/No files were modified/);
  });

  // Issue A: a Move to the same path would write the new content then remove
  // the (same) source, deleting the file. Must be rejected before any write.
  it("rejects a Move to the same path without touching the file", async () => {
    vol.writeFileSync(join(cwd, "same.txt"), "original\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: same.txt\n*** Move to: same.txt\n@@\n-original\n+new\n*** End Patch",
    );
    await expect(applyHunks(hunks, cwd)).rejects.toThrow(
      /Move to: 'same.txt' is the same as the source path/,
    );
    // File is untouched -- no data loss.
    expect(vol.readFileSync(join(cwd, "same.txt"), "utf8")).toBe("original\n");
  });

  it("rejects a Move to the same path via a different relative spelling", async () => {
    vol.writeFileSync(join(cwd, "same.txt"), "original\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: same.txt\n*** Move to: ./same.txt\n@@\n-original\n+new\n*** End Patch",
    );
    await expect(applyHunks(hunks, cwd)).rejects.toThrow(
      /same as the source path/,
    );
    expect(vol.readFileSync(join(cwd, "same.txt"), "utf8")).toBe("original\n");
  });

  it("rejects a Move to a symlink alias of the source", async () => {
    vol.writeFileSync(join(cwd, "same.txt"), "original\n");
    vol.symlinkSync(join(cwd, "same.txt"), join(cwd, "alias.txt"));
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: same.txt\n*** Move to: alias.txt\n@@\n-original\n+new\n*** End Patch",
    );

    await expect(applyHunks(hunks, cwd)).rejects.toThrow(
      /same as the source path/,
    );
    expect(vol.readFileSync(join(cwd, "same.txt"), "utf8")).toBe("original\n");
  });

  // Issue B: Add File over an existing file overwrites (codex scenario 011)
  // but is reported in `overwritten` and the summary so the clobber is visible.
  it("Add File over an existing file overwrites and reports the overwrite", async () => {
    vol.writeFileSync(join(cwd, "dup.txt"), "old content\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Add File: dup.txt\n+new content\n*** End Patch",
    );
    const result = await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "dup.txt"), "utf8")).toBe(
      "new content\n",
    );
    expect(result.affected.overwritten).toContain("dup.txt");
    expect(result.summary).toContain("O dup.txt (overwrote existing)");
  });

  it("Move to an existing destination overwrites and reports the overwrite", async () => {
    vol.mkdirSync(join(cwd, "old"), { recursive: true });
    vol.mkdirSync(join(cwd, "renamed/dir"), { recursive: true });
    vol.writeFileSync(join(cwd, "old/name.txt"), "from\n");
    vol.writeFileSync(join(cwd, "old/other.txt"), "unrelated file\n");
    vol.writeFileSync(join(cwd, "renamed/dir/name.txt"), "existing\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-from\n+new\n*** End Patch",
    );
    const result = await applyHunks(hunks, cwd);
    expect(vol.existsSync(join(cwd, "old/name.txt"))).toBe(false);
    expect(vol.readFileSync(join(cwd, "renamed/dir/name.txt"), "utf8")).toBe(
      "new\n",
    );
    // Unrelated sibling is untouched.
    expect(vol.readFileSync(join(cwd, "old/other.txt"), "utf8")).toBe(
      "unrelated file\n",
    );
    expect(result.affected.overwritten).toContain("renamed/dir/name.txt");
    expect(result.fileChanges).toContainEqual({
      path: "old/name.txt",
      before: "from\n",
      after: "",
    });
    expect(result.fileChanges).toContainEqual({
      path: "renamed/dir/name.txt",
      before: "existing\n",
      after: "new\n",
    });
  });

  it("Add File on a genuinely new path does not report an overwrite", async () => {
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Add File: brand.txt\n+hi\n*** End Patch",
    );
    const result = await applyHunks(hunks, cwd);
    expect(result.affected.overwritten).toEqual([]);
    expect(result.summary).not.toContain("overwrote existing");
  });

  it("streams a partial result after each committed hunk", async () => {
    vol.writeFileSync(join(cwd, "a.txt"), "a\n");
    vol.writeFileSync(join(cwd, "b.txt"), "b\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n" +
        "*** Add File: new.txt\n+hi\n" +
        "*** Update File: a.txt\n@@\n-a\n+A2\n" +
        "*** Delete File: b.txt\n" +
        "*** End Patch",
    );
    const ticks: ApplyPatchResult[] = [];
    await applyHunks(hunks, cwd, (partial) => ticks.push(partial));

    // One tick per committed hunk, in commit order.
    expect(ticks).toHaveLength(3);
    expect(ticks.at(0)?.summary).toEqual(["A new.txt"]);
    expect(ticks.at(1)?.summary).toEqual(["A new.txt", "M a.txt"]);
    expect(ticks.at(2)?.summary).toEqual(["A new.txt", "M a.txt", "D b.txt"]);
    // Each tick only includes file changes committed so far.
    expect(ticks.at(0)?.fileChanges.map((c) => c.path)).toEqual(["new.txt"]);
    expect(ticks.at(1)?.fileChanges.map((c) => c.path)).toEqual([
      "new.txt",
      "a.txt",
    ]);
  });

  it("serializes concurrent patches that affect the same file", async () => {
    vol.writeFileSync(join(cwd, "shared.txt"), "alpha\nbeta\n");
    const first = parsePatch(
      "*** Begin Patch\n*** Update File: shared.txt\n@@\n-alpha\n+ALPHA\n*** End Patch",
    );
    const second = parsePatch(
      "*** Begin Patch\n*** Update File: shared.txt\n@@\n-beta\n+BETA\n*** End Patch",
    );

    await Promise.all([
      applyHunks(first.hunks, cwd),
      applyHunks(second.hunks, cwd),
    ]);

    expect(vol.readFileSync(join(cwd, "shared.txt"), "utf8")).toBe(
      "ALPHA\nBETA\n",
    );
  });

  it("does not mutate when already aborted", async () => {
    vol.writeFileSync(join(cwd, "abort.txt"), "before\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: abort.txt\n@@\n-before\n+after\n*** End Patch",
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      applyHunks(hunks, cwd, undefined, controller.signal),
    ).rejects.toThrow();
    expect(vol.readFileSync(join(cwd, "abort.txt"), "utf8")).toBe("before\n");
  });
});

// Ports of openai/codex `codex-rs/apply-patch/tests/fixtures/scenarios` and
// `src/lib.rs` unit tests. These pin the V4A engine to codex's behaviour for
// the cases the Codex models were trained on.
describe("applyHunks (codex scenarios)", () => {
  const cwd = "/tmp/codex-scenarios";

  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(cwd, { recursive: true });
  });

  // fixtures/scenarios/016_pure_addition_update_chunk
  it("pure-addition update chunk inserts before the trailing newline", async () => {
    vol.writeFileSync(join(cwd, "input.txt"), "line1\nline2\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: input.txt\n@@\n+added line 1\n+added line 2\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "input.txt"), "utf8")).toBe(
      "line1\nline2\nadded line 1\nadded line 2\n",
    );
  });

  // fixtures/scenarios/021_update_file_deletion_only
  it("deletion-only update chunk removes the matched lines", async () => {
    vol.writeFileSync(join(cwd, "lines.txt"), "line1\nline2\nline3\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: lines.txt\n@@\n line1\n-line2\n line3\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "lines.txt"), "utf8")).toBe(
      "line1\nline3\n",
    );
  });

  // fixtures/scenarios/022_update_file_end_of_file_marker
  it("*** End of File marker anchors the change at the file tail", async () => {
    vol.writeFileSync(join(cwd, "tail.txt"), "first\nsecond\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: tail.txt\n@@\n first\n-second\n+second updated\n*** End of File\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "tail.txt"), "utf8")).toBe(
      "first\nsecond updated\n",
    );
  });

  // fixtures/scenarios/014_update_file_appends_trailing_newline
  it("update on a file with no trailing newline appends one", async () => {
    vol.writeFileSync(join(cwd, "no_newline.txt"), "no newline at end");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: no_newline.txt\n@@\n-no newline at end\n+first line\n+second line\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "no_newline.txt"), "utf8")).toBe(
      "first line\nsecond line\n",
    );
  });

  // fixtures/scenarios/015_failure_after_partial_success_leaves_changes
  // Plus Issue E: the error lists the files already modified.
  it("partial success leaves earlier changes on disk and names them in the error", async () => {
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Add File: created.txt\n+hello\n*** Update File: missing.txt\n@@\n-old\n+new\n*** End Patch",
    );
    await expect(applyHunks(hunks, cwd)).rejects.toThrow(
      /Failed to read file to update[\s\S]*Files already modified before this error: created.txt/,
    );
    // created.txt remains (best-effort, non-transactional).
    expect(vol.readFileSync(join(cwd, "created.txt"), "utf8")).toBe("hello\n");
  });

  it("names both paths of an earlier committed move on later failure", async () => {
    vol.writeFileSync(join(cwd, "source.txt"), "old\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n" +
        "*** Update File: source.txt\n*** Move to: destination.txt\n@@\n-old\n+new\n" +
        "*** Update File: missing.txt\n@@\n-old\n+new\n" +
        "*** End Patch",
    );

    await expect(applyHunks(hunks, cwd)).rejects.toThrow(
      /Files already modified before this error: source\.txt, destination\.txt/,
    );
  });

  // lib.rs test_pure_addition_chunk_followed_by_removal: two chunks in one
  // update hunk, first a pure addition then a removal. Verifies replacement
  // ordering (descending index) keeps both changes consistent.
  it("pure-addition chunk followed by a removal chunk in one hunk", async () => {
    vol.writeFileSync(join(cwd, "panic.txt"), "line1\nline2\nline3\n");
    const { hunks } = parsePatch(
      "*** Begin Patch\n*** Update File: panic.txt\n@@\n+after-context\n+second-line\n@@\n line1\n-line2\n-line3\n+line2-replacement\n*** End Patch",
    );
    await applyHunks(hunks, cwd);
    expect(vol.readFileSync(join(cwd, "panic.txt"), "utf8")).toBe(
      "line1\nline2-replacement\nafter-context\nsecond-line\n",
    );
  });
});

describe("apply_patch tool", () => {
  const cwd = "/tmp/proj2";

  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(cwd, { recursive: true });
  });

  it("parses and applies a patch end-to-end", async () => {
    vol.writeFileSync(join(cwd, "app.ts"), "export const X = 1;\n");
    const tool = createApplyPatchToolDefinition(cwd);
    const result = await executeToolDefinition(
      tool,
      {
        input:
          "*** Begin Patch\n*** Update File: app.ts\n@@\n-export const X = 1;\n+export const X = 2;\n*** End Patch",
      },
      { cwd },
    );
    expect(vol.readFileSync(join(cwd, "app.ts"), "utf8")).toBe(
      "export const X = 2;\n",
    );
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.details?.summary).toContain("M app.ts");
    expect(result.details?.diff).toContain("-1 export const X = 1;");
    expect(result.details?.diff).toContain("+1 export const X = 2;");
    expectStructuredOutput(tool, result);
    expect(result.structuredContent).toEqual({
      added: [],
      modified: ["app.ts"],
      deleted: [],
      overwritten: [],
    });
  });

  it.each([
    { path: "logo.data", content: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
    { path: "archive.data", content: Buffer.from([0x01, 0x00, 0x02]) },
  ])("detects binary $path by content, not extension", async ({
    path,
    content,
  }) => {
    vol.writeFileSync(join(cwd, path), content);
    const tool = createApplyPatchToolDefinition(cwd);
    const result = await executeToolDefinition(
      tool,
      {
        input: `*** Begin Patch\n*** Delete File: ${path}\n*** End Patch`,
      },
      { cwd },
    );

    expect(result.details?.fileDiffs).toEqual([
      { status: "D", path, isBinary: true, diff: "" },
    ]);
  });

  it("keeps valid UTF-8 text diffable even when it starts with GIF", async () => {
    vol.writeFileSync(join(cwd, "notes.txt"), "GIF notes\n");
    const tool = createApplyPatchToolDefinition(cwd);
    const result = await executeToolDefinition(
      tool,
      {
        input: "*** Begin Patch\n*** Delete File: notes.txt\n*** End Patch",
      },
      { cwd },
    );

    expect(result.details?.fileDiffs).toEqual([
      { status: "D", path: "notes.txt", diff: "-1 GIF notes" },
    ]);
  });

  it("surfaces parse errors as thrown errors", async () => {
    const tool = createApplyPatchToolDefinition(cwd);
    await expect(
      executeToolDefinition(tool, { input: "not a patch" }, { cwd }),
    ).rejects.toThrow(ApplyPatchParseError);
  });

  it("streams partial details via onUpdate as each file is applied", async () => {
    vol.writeFileSync(join(cwd, "a.ts"), "export const A = 1;\n");
    const tool = createApplyPatchToolDefinition(cwd);
    const updates: unknown[] = [];
    await executeToolDefinition(
      tool,
      {
        input:
          "*** Begin Patch\n" +
          "*** Add File: b.ts\n+export const B = 2;\n" +
          "*** Update File: a.ts\n@@\n-export const A = 1;\n+export const A = 3;\n" +
          "*** End Patch",
      },
      { cwd, onUpdate: (partial) => updates.push(partial) },
    );

    // One partial per committed hunk. Each carries the renderable details
    // (summary + fileDiffs) accumulated so far, with empty content.
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      content: [],
      details: { summary: ["A b.ts"] },
    });
    expect(updates[1]).toMatchObject({
      content: [],
      details: { summary: ["A b.ts", "M a.ts"] },
    });
    // The second partial already carries the diff for the first file.
    const secondDetails = updates.at(1) as {
      details: { fileDiffs: { path: string }[] };
    };
    expect(secondDetails.details.fileDiffs.map((f) => f.path)).toEqual([
      "b.ts",
      "a.ts",
    ]);
  });
});
