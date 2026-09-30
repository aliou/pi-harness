import type { SessionResult } from "@harness/session-store";
import { listSessions } from "@harness/session-store";
import { executeToolDefinition } from "@harness/test-utils/pi-context";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSessionsTool } from "./index";

vi.mock("@harness/session-store", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, listSessions: vi.fn() };
});

const session: SessionResult = {
  id: "11111111-2222-3333-4444-555555555555",
  path: "/sessions/a.jsonl",
  cwd: "/work/project",
  name: undefined,
  created: "2026-01-01T00:00:00.000Z",
  modified: "2026-01-02T00:00:00.000Z",
  messageCount: 3,
  matchedSnippet: "ignored",
  score: 0,
  matchMode: "browse",
  matchedType: null,
  matchedEntryId: null,
  matchedAt: null,
};

beforeEach(() => {
  vi.mocked(listSessions).mockReset();
});

function textOf(result: { content: Array<{ type: string }> }): string {
  const [block] = result.content;
  return block && "text" in block ? String(block.text) : "";
}

describe("list_sessions result contract", () => {
  it("returns the model-facing JSON as structured content", async () => {
    vi.mocked(listSessions).mockResolvedValue([session]);

    const result = await executeToolDefinition(listSessionsTool, {
      cwd: "/work/project",
    });

    expectStructuredOutput(listSessionsTool, result);
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
    expect(result.structuredContent).toEqual({
      cwd: "/work/project",
      resultCount: 1,
      results: [
        {
          id: session.id,
          path: session.path,
          cwd: session.cwd,
          created: session.created,
          modified: session.modified,
          messageCount: 3,
          matchMode: "browse",
          matchedType: null,
          matchedEntryId: null,
          matchedAt: null,
        },
      ],
    });
  });

  it("marks a failed listing as an error that still carries data", async () => {
    vi.mocked(listSessions).mockRejectedValue(new Error("db locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await executeToolDefinition(listSessionsTool, {
      cwd: "/work/project",
    });

    expect(result.isError).toBe(true);
    expectStructuredOutput(listSessionsTool, result);
    expect(result.structuredContent).toEqual({
      cwd: "/work/project",
      resultCount: 0,
      results: [],
      error: "List failed: db locked",
    });
  });

  it("declares read-only, closed-world annotations", () => {
    expect(listSessionsTool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
