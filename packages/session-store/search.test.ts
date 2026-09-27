import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSearchClient, sesameSearch } = vi.hoisted(() => ({
  getSearchClient: vi.fn(),
  sesameSearch: vi.fn(),
}));

vi.mock("@aliou/sesame", () => ({
  parseRelativeDate: () => "2026-07-06T00:00:00.000Z",
}));

vi.mock("./db", () => ({ getSearchClient }));

import { searchSessions } from "./search";

describe("searchSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSearchClient.mockReturnValue({ search: sesameSearch });
    sesameSearch.mockReturnValue([]);
  });

  it("uses Sesame browse mode when the query is omitted", async () => {
    await searchSessions({});

    expect(sesameSearch).toHaveBeenCalledWith(
      undefined,
      {
        after: undefined,
        before: undefined,
        cwd: undefined,
        limit: undefined,
      },
      undefined,
    );
  });

  it("preserves Sesame match provenance", async () => {
    sesameSearch.mockReturnValue([
      {
        sessionId: "session-id",
        source: "pi",
        path: "/sessions/session.jsonl",
        cwd: "/project",
        name: "Deploy session",
        score: -2,
        createdAt: "2026-07-01T00:00:00.000Z",
        modifiedAt: "2026-07-02T00:00:00.000Z",
        matchedSnippet: "deploy checkpoint",
        matchMode: "all",
        matchedType: "label",
        matchedEntryId: "entry-id",
        matchedAt: "2026-07-01T12:00:00.000Z",
        messageCount: 3,
      },
    ]);

    const results = await searchSessions({ query: "deploy checkpoint" });
    expect(results).toEqual([
      expect.objectContaining({
        matchMode: "all",
        matchedType: "label",
        matchedEntryId: "entry-id",
        matchedAt: "2026-07-01T12:00:00.000Z",
      }),
    ]);
  });
});
