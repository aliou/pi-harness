import type {
  ExecResult,
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { executeToolDefinition } from "@harness/test-utils/pi-context";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import findExtension from "./index";

const ROOT = "/work/project";

function setupFind(stdout: string) {
  let tool: ToolDefinition | undefined;
  const exec = vi.fn(
    async (): Promise<ExecResult> => ({
      stdout,
      stderr: "",
      code: 0,
      killed: false,
    }),
  );
  findExtension({
    registerTool: (definition: ToolDefinition) => {
      tool = definition;
    },
    exec,
  } as unknown as ExtensionAPI);
  if (!tool) throw new Error("find was not registered");
  return { tool, exec };
}

beforeEach(() => {
  vol.fromJSON({ [`${ROOT}/src/.keep`]: "" });
});

describe("find tool result contract", () => {
  it("returns the matched paths as structured content", async () => {
    const { tool } = setupFind(`${ROOT}/src/a.ts\n${ROOT}/src/b.ts\n`);

    const result = await executeToolDefinition(
      tool,
      { pattern: "*.ts", path: "src", limit: 10 },
      { cwd: ROOT },
    );

    expect(result.content).toEqual([{ type: "text", text: "a.ts\nb.ts" }]);
    expectStructuredOutput(tool, result);
    expect(result.structuredContent).toEqual({
      root: `${ROOT}/src`,
      paths: ["a.ts", "b.ts"],
      totalResults: 2,
      resultLimitReached: false,
      relativeTo: "src",
    });
  });

  it("reports when the result limit cuts the list", async () => {
    const { tool } = setupFind(`${ROOT}/a.ts\n${ROOT}/b.ts\n`);

    const result = await executeToolDefinition(
      tool,
      { pattern: "*.ts", limit: 2 },
      { cwd: ROOT },
    );

    expect(result.structuredContent).toMatchObject({
      root: ROOT,
      totalResults: 2,
      resultLimitReached: true,
    });
  });

  it("returns an empty list when nothing matches", async () => {
    const { tool } = setupFind("");

    const result = await executeToolDefinition(
      tool,
      { pattern: "*.rs" },
      { cwd: ROOT },
    );

    expect(result.content).toEqual([
      { type: "text", text: "No files found matching the pattern." },
    ]);
    expectStructuredOutput(tool, result);
    expect(result.structuredContent).toEqual({
      root: ROOT,
      paths: [],
      totalResults: 0,
      resultLimitReached: false,
    });
  });

  it("declares read-only, closed-world annotations", () => {
    const { tool } = setupFind("");

    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
