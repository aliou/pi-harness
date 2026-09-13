import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computePatchPreview, previewFileReader } from "./preview";
import { renderApplyPatchCall } from "./render";

const plainTheme = {
  fg: (_name: string, text: string) => text,
  bg: (_name: string, text: string) => text,
  bold: (text: string) => text,
  inverse: (text: string) => text,
} as Theme;

const BEFORE = "line one\nline two\nline three\n";
const PATCH =
  "*** Begin Patch\n" +
  "*** Update File: app.ts\n" +
  "@@\n" +
  " line one\n" +
  "-line two\n" +
  "+line 2\n" +
  " line three\n" +
  "*** End Patch\n";

describe("computePatchPreview", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  it("computes the diff an update hunk would produce", async () => {
    const read = vi.fn(async () => BEFORE);
    const preview = await computePatchPreview(PATCH, "/repo", read);

    expect("error" in preview && preview.error).toBeFalsy();
    if ("error" in preview) throw new Error("expected fileDiffs");
    expect(preview.fileDiffs).toHaveLength(1);
    const diff = preview.fileDiffs[0];
    expect(diff).toBeDefined();
    if (!diff) return;
    expect(diff.status).toBe("M");
    expect(diff.path).toBe("app.ts");
    expect(diff.diff).toMatch(/^-\s*\d+ line two$/m);
    expect(diff.diff).toMatch(/^\+\s*\d+ line 2$/m);
  });

  it("marks added files as A with full contents as additions", async () => {
    const patch =
      "*** Begin Patch\n" +
      "*** Add File: new.ts\n" +
      "+hello\n" +
      "*** End Patch\n";
    const preview = await computePatchPreview(patch, "/repo", async () => {
      throw new Error("should not read for Add File");
    });

    if ("error" in preview) throw new Error("expected fileDiffs");
    expect(preview.fileDiffs[0]).toMatchObject({ status: "A", path: "new.ts" });
    expect(preview.fileDiffs[0]?.diff).toMatch(/^\+\s*\d+ hello$/m);
  });

  it("skips files that cannot be read instead of failing the preview", async () => {
    const both =
      "*** Begin Patch\n" +
      "*** Update File: missing.ts\n" +
      "@@\n" +
      "-x\n" +
      "+y\n" +
      "*** Update File: app.ts\n" +
      "@@\n" +
      " line one\n" +
      "-line two\n" +
      "+line 2\n" +
      "*** End Patch\n";
    const read = vi.fn(async (path: string) =>
      path.endsWith("app.ts") ? BEFORE : null,
    );
    const preview = await computePatchPreview(both, "/repo", read);

    if ("error" in preview) throw new Error("expected fileDiffs");
    expect(preview.fileDiffs).toHaveLength(1);
    expect(preview.fileDiffs[0]?.path).toBe("app.ts");
  });

  it("returns an error preview for an unparsable patch", async () => {
    const preview = await computePatchPreview(
      "not a patch",
      "/repo",
      async () => null,
    );
    expect("error" in preview).toBe(true);
  });
});

describe("renderApplyPatchCall live preview", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes a preview once argsComplete and invalidates for redraw", async () => {
    const realRead = previewFileReader.read;
    const read = vi.fn(async (path: string) =>
      path.endsWith("app.ts") ? BEFORE : null,
    );
    previewFileReader.read = read;
    const invalidate = vi.fn();
    const state: Parameters<typeof renderApplyPatchCall>[2]["state"] = {};

    // Mid-stream: no preview, static count only.
    renderApplyPatchCall({ input: PATCH }, plainTheme, {
      args: { input: PATCH },
      cwd: "/repo",
      state,
      isError: false,
      isPartial: true,
      argsComplete: false,
      invalidate,
    });
    expect(read).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();

    // Args complete: preview computation is scheduled...
    renderApplyPatchCall({ input: PATCH }, plainTheme, {
      args: { input: PATCH },
      cwd: "/repo",
      state,
      isError: false,
      isPartial: true,
      argsComplete: true,
      invalidate,
    });
    expect(read).toHaveBeenCalledTimes(1);

    // ...the promise resolves and calls invalidate for a redraw.
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());

    // On the re-render, the call component now shows the preview lines.
    const settled = renderApplyPatchCall({ input: PATCH }, plainTheme, {
      args: { input: PATCH },
      cwd: "/repo",
      state,
      isError: false,
      isPartial: false,
      argsComplete: true,
      invalidate,
    });
    const output = settled.render(120).join("\n");
    expect(output).toContain("+1 updated");
    expect(output).toContain("M  app.ts");

    // Only computed once for these args.
    expect(read).toHaveBeenCalledTimes(1);
    previewFileReader.read = realRead;
  });

  it("does not compute a preview while args are still streaming", () => {
    const state: Parameters<typeof renderApplyPatchCall>[2]["state"] = {};
    const component = renderApplyPatchCall({ input: PATCH }, plainTheme, {
      args: { input: PATCH },
      cwd: "/repo",
      state,
      isError: false,
      isPartial: true,
      argsComplete: false,
    });
    expect(component.render(120).join("\n")).not.toMatch(/^-\s*\d+ line two$/m);
  });
});
