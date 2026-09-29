import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderApplyPatchCall, renderApplyPatchResult } from "./render";

const plainTheme = {
  fg: (_name: string, text: string) => text,
  bg: (_name: string, text: string) => text,
  bold: (text: string) => text,
  inverse: (text: string) => text,
} as Theme;

describe("apply_patch result rendering", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  const result = {
    content: [{ type: "text", text: "Success" }],
    details: {
      patch: "*** Begin Patch\n*** Update File: app.ts\n*** End Patch",
      summary: ["M app.ts"],
      fileDiffs: [
        {
          status: "M" as const,
          path: "app.ts",
          diff: "-1 old line\n+1 new line",
        },
      ],
      diff: "app.ts\n-1 old line\n+1 new line",
    },
  };

  it("shows file summary with per-file stat when collapsed", () => {
    const component = renderApplyPatchResult(
      result,
      { expanded: false },
      plainTheme,
      { isError: false },
    );
    const output = component.render(120).join("\n");

    expect(output).toContain("M  app.ts");
    expect(output).toContain("(+1");
    expect(output).toContain("-1");
    expect(output).not.toContain("old line");
    expect(output).not.toContain("new line");
  });

  it("shows diff with status and stat on path line when expanded", () => {
    const component = renderApplyPatchResult(
      result,
      { expanded: true },
      plainTheme,
      { isError: false },
    );
    const output = component.render(120).join("\n");

    expect(output).toContain("M  app.ts");
    expect(output).toContain("old line");
    expect(output).toContain("new line");
  });

  it("suppresses expanded diffs for binary files", () => {
    const component = renderApplyPatchResult(
      {
        ...result,
        details: {
          ...result.details,
          summary: ["M assets/logo.png"],
          fileDiffs: [
            {
              status: "M" as const,
              path: "assets/logo.png",
              isBinary: true,
              diff: "-binary old bytes\n+binary new bytes",
            },
          ],
        },
      },
      { expanded: true },
      plainTheme,
      { isError: false },
    );
    const output = component.render(120).join("\n");

    expect(output).toContain("M  assets/logo.png");
    expect(output).toContain("binary file; diff suppressed");
    expect(output).not.toContain("binary old bytes");
    expect(output).not.toContain("binary new bytes");
  });
});

describe("apply_patch call rendering", () => {
  const patch =
    "*** Begin Patch\n" +
    "*** Update File: one.ts\n" +
    "@@\n" +
    " context line\n" +
    "-old line\n" +
    "+new line\n" +
    "*** End Patch";

  const context = {
    args: {},
    cwd: "/tmp",
    state: {},
    isError: false,
    isPartial: true,
  };

  it("shows status counts in the header", () => {
    const component = renderApplyPatchCall({ input: patch }, plainTheme, {
      ...context,
      state: {},
    });
    const output = component.render(120)[0] ?? "";

    expect(output).toContain("apply_patch");
    expect(output).toContain("+1 updated");
    // Header holds the counts only; file names live in the streamed body.
    expect(output).not.toContain("one.ts");
  });

  it("streams the partial patch text under the header", () => {
    const partial = patch.slice(0, patch.indexOf("+new line"));
    const component = renderApplyPatchCall({ input: partial }, plainTheme, {
      ...context,
      state: {},
    });
    const output = component.render(120).join("\n");

    expect(output).toContain("*** Begin Patch");
    expect(output).toContain("*** Update File: one.ts");
    expect(output).toContain("-old line");
    expect(output).not.toContain("+new line");
  });

  it("shows no body while the input is still empty", () => {
    const component = renderApplyPatchCall({ input: "" }, plainTheme, {
      ...context,
      state: {},
    });
    expect(component.render(120)).toHaveLength(1);
  });

  it("caps the streamed body and hints at expansion when collapsed", () => {
    const longPatch =
      "*** Begin Patch\n" +
      Array.from({ length: 30 }, (_, i) => `+line ${i + 1}`).join("\n") +
      "\n*** End Patch";
    const component = renderApplyPatchCall({ input: longPatch }, plainTheme, {
      ...context,
      state: {},
    });
    const output = component.render(120).join("\n");

    expect(output).toContain("+line 9");
    expect(output).not.toContain("+line 10");
    expect(output).toContain("more lines");
    expect(output).toContain("32 total");
  });

  it("shows the full patch when expanded", () => {
    const longPatch =
      "*** Begin Patch\n" +
      Array.from({ length: 30 }, (_, i) => `+line ${i + 1}`).join("\n") +
      "\n*** End Patch";
    const component = renderApplyPatchCall({ input: longPatch }, plainTheme, {
      ...context,
      state: {},
      expanded: true,
    });
    const output = component.render(120).join("\n");

    expect(output).toContain("+line 30");
    expect(output).not.toContain("more lines");
  });
});
