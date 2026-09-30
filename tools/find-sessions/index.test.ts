import type { SessionResult } from "@harness/session-store";
import { searchSessions } from "@harness/session-store";
import { executeToolDefinition } from "@harness/test-utils/pi-context";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findSessionsTool } from "./index";

vi.mock("@harness/session-store", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, searchSessions: vi.fn() };
});

const session: SessionResult = {
  id: "11111111-2222-3333-4444-555555555555",
  path: "/sessions/a.jsonl",
  cwd: "/work/project",
  name: "Fix auth",
  created: "2026-01-01T00:00:00.000Z",
  modified: "2026-01-02T00:00:00.000Z",
  messageCount: 12,
  matchedSnippet: "token refresh",
  score: 1.5,
  matchMode: "all",
  matchedType: "message",
  matchedEntryId: "entry-1",
  matchedAt: "2026-01-02T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(searchSessions).mockReset();
});

function textOf(result: { content: Array<{ type: string }> }): string {
  const [block] = result.content;
  return block && "text" in block ? String(block.text) : "";
}

describe("find_sessions result contract", () => {
  it("returns the model-facing JSON as structured content", async () => {
    vi.mocked(searchSessions).mockResolvedValue([
      session,
      { ...session, id: "stub-session-id" },
    ]);

    const result = await executeToolDefinition(findSessionsTool, {
      query: "auth",
    });

    expectStructuredOutput(findSessionsTool, result);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
    expect(result.structuredContent).toEqual({
      query: "auth",
      resultCount: 1,
      results: [session],
    });
  });

  it("marks a failed search as an error that still carries data", async () => {
    vi.mocked(searchSessions).mockRejectedValue(new Error("db locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await executeToolDefinition(findSessionsTool, {});

    expect(result.isError).toBe(true);
    expectStructuredOutput(findSessionsTool, result);
    expect(result.structuredContent).toEqual({
      resultCount: 0,
      results: [],
      error: "Search failed: db locked",
    });
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });

  it("declares read-only, closed-world annotations", () => {
    expect(findSessionsTool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
