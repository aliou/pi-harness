import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScoutGrepTool } from "./grep";

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "scout-grep-"));
  writeFileSync(
    path.join(dir, "normal.txt"),
    "alpha needle\nbeta\nneedle again\n",
  );
  // One-line file whose single line genuinely matches the pattern. Long enough
  // that its rg --json event (~3KB) exceeds the 1KB test cap, while events for
  // normal.txt (~300B) stay under it.
  writeFileSync(
    path.join(dir, "big-one-line.json"),
    `${JSON.stringify({ text: `needle ${"x".repeat(2048)}` })}\n\n`,
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ctx = { cwd: dir, extensionPath: dir } as never;

function execute(params: Record<string, unknown>, maxLineBytes?: number) {
  const definition = createScoutGrepTool(dir, maxLineBytes);
  return definition.execute(
    "call-1",
    params as never,
    undefined,
    undefined,
    ctx,
  );
}

function textOf(result: Awaited<ReturnType<typeof execute>>): string {
  const first = result.content[0];
  return first && "text" in first ? first.text : "";
}

describe("createScoutGrepTool", () => {
  it("returns matches with paths and line numbers", async () => {
    const result = await execute({ pattern: "needle", path: dir });
    const text = textOf(result);
    expect(text).toContain("normal.txt:1:");
    expect(text).toContain("needle again");
  });

  it("returns no matches message", async () => {
    const result = await execute({
      pattern: "does-not-exist-anywhere",
      path: dir,
    });
    expect(textOf(result)).toBe("No matches found");
  });

  it("reports when the match limit is reached", async () => {
    const result = await execute({ pattern: "needle", path: dir, limit: 1 });
    expect(result.details?.matchLimitReached).toBe(1);
    expect(textOf(result)).toContain(":");
  });

  it("discards oversized matched lines with a MISSING notice instead of crashing", async () => {
    // The 692MB one-line file from the real crash is simulated with a ~3KB
    // event against a 1KB cap: same code path, no giant fixture.
    const result = await execute({ pattern: "needle", path: dir }, 1024);
    expect(result.details?.oversizedDiscarded).toBeGreaterThanOrEqual(1);
    const text = textOf(result);
    expect(text).toContain("oversized line(s)");
    expect(text).toContain("MISSING");
    // Normal matches still come through.
    expect(text).toContain("normal.txt:1:");
  });

  it("surfaces the oversized notice when every match was discarded", async () => {
    const result = await execute({ pattern: "x{30}", path: dir }, 1024);
    expect(result.details?.oversizedDiscarded).toBeGreaterThanOrEqual(1);
    expect(textOf(result)).toContain("oversized line(s)");
  });

  it("truncates very long match lines", async () => {
    const result = await execute({ pattern: "needle", path: dir });
    const text = textOf(result);
    for (const line of text.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(600);
    }
  });
});
