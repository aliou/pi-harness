import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { createRexAutocompleteProvider } from "./provider";
import { REX_PREFIX, type RexSnapshot } from "./types";

function makeMockPi(snapshot: RexSnapshot) {
  return {
    exec: vi.fn(async (_cmd: string, args: string[]) => {
      if (args[0] === "ls") {
        return {
          code: 0,
          stdout: JSON.stringify({
            sessions: snapshot.sessions.map((s) => ({
              session_id: s.sessionId,
              label: s.label,
            })),
          }),
          stderr: "",
        };
      }
      const sessionId = args[2];
      const session = snapshot.sessions.find((s) => s.sessionId === sessionId);
      const blocks = snapshot.blocks.filter((b) => b.sessionId === sessionId);
      return {
        code: 0,
        stdout: JSON.stringify({
          session_id: sessionId,
          label: session?.label ?? "",
          windows: [
            {
              window_id: blocks[0]?.windowId ?? "window:w1",
              label: blocks[0]?.windowLabel ?? "Window w1",
              focused_block_id:
                blocks.find((b) => b.focused)?.blockId ?? undefined,
              layers: [
                {
                  blocks: blocks.map((b) => ({
                    block_id: b.blockId,
                    label: b.blockLabel,
                  })),
                },
              ],
            },
          ],
        }),
        stderr: "",
      };
    }),
  };
}

function makeMockCurrent(items: AutocompleteItem[]): AutocompleteProvider {
  return {
    async getSuggestions() {
      return { items, prefix: "" };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
    shouldTriggerFileCompletion() {
      return true;
    },
  };
}

const sessionA = { sessionId: "session:aaa", label: "homelab" };
const sessionB = { sessionId: "session:bbb", label: "toolbox" };

const snapshot: RexSnapshot = {
  sessions: [sessionA, sessionB],
  blocks: [
    {
      blockId: "block:1",
      sessionId: sessionA.sessionId,
      sessionLabel: sessionA.label,
      windowId: "window:w1",
      windowLabel: "Window w1",
      blockLabel: "shell",
      focused: true,
    },
    {
      blockId: "block:2",
      sessionId: sessionA.sessionId,
      sessionLabel: sessionA.label,
      windowId: "window:w1",
      windowLabel: "Window w1",
      blockLabel: "monitor",
      focused: false,
    },
    {
      blockId: "block:3",
      sessionId: sessionB.sessionId,
      sessionLabel: sessionB.label,
      windowId: "window:w2",
      windowLabel: "Window w2",
      blockLabel: "shell",
      focused: false,
    },
  ],
};

function provider(token: string, current: AutocompleteProvider, self = {}) {
  const pi = makeMockPi(snapshot);
  const p = createRexAutocompleteProvider(current, pi as never, self);
  return {
    run: () =>
      p.getSuggestions([token], 0, token.length, {
        signal: new AbortController().signal,
      } as never),
    pi,
  };
}

describe("createRexAutocompleteProvider", () => {
  it("suggests sessions and blocks after the prefix", async () => {
    const { run } = provider("@rex:", makeMockCurrent([]));
    const result = await run();
    expect(result?.prefix).toBe("@rex:");
    expect(result?.items.map((i) => i.value)).toEqual([
      `${REX_PREFIX}session:session:aaa`,
      `${REX_PREFIX}session:session:bbb`,
      // Focused block first, then blocks by session order (newest session first).
      `${REX_PREFIX}block:block:1`,
      `${REX_PREFIX}block:block:3`,
      `${REX_PREFIX}block:block:2`,
    ]);
  });

  it("filters by kind and matches the query", async () => {
    const { run } = provider("@rex:block:shell", makeMockCurrent([]));
    const result = await run();
    expect(result?.prefix).toBe("@rex:block:shell");
    expect(result?.items.map((i) => i.value)).toEqual([
      `${REX_PREFIX}block:block:1`,
      `${REX_PREFIX}block:block:3`,
    ]);
  });

  it("marks the current session and block", async () => {
    const { run } = provider("@rex:", makeMockCurrent([]), {
      sessionId: sessionA.sessionId,
      blockId: "block:2",
    });
    const result = await run();
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels[0]?.includes("(you)")).toBe(true);
    expect(
      labels.find((l) => l.startsWith("homelab · monitor"))?.includes("(you)"),
    ).toBe(true);
  });

  it("suggests the bare prefix when partially typed", async () => {
    const current = makeMockCurrent([{ value: "file", label: "file" }]);
    const { run } = provider("@re", current);
    const result = await run();
    expect(result?.prefix).toBe("@re");
    expect(result?.items[0]?.value).toBe(REX_PREFIX);
    expect(result?.items.map((i) => i.value)).toContain("file");
  });

  it("falls back to the current provider for non-rex input", async () => {
    const current = makeMockCurrent([{ value: "file", label: "file" }]);
    const { run } = provider("src/ma", current);
    const result = await run();
    expect(result?.items).toEqual([{ value: "file", label: "file" }]);
  });

  it("completes a block ref with a trailing space", () => {
    const current = makeMockCurrent([]);
    const p = createRexAutocompleteProvider(
      current,
      makeMockPi(snapshot) as never,
      {},
    );
    const edit = p.applyCompletion(
      ["@rex:block:block:1"],
      0,
      18,
      { value: `${REX_PREFIX}block:block:1`, label: "" },
      `${REX_PREFIX}block:block:1`,
    );
    expect(edit.lines[0]).toBe(`${REX_PREFIX}block:block:1 `);
    expect(edit.cursorCol).toBe(`${REX_PREFIX}block:block:1 `.length);
  });
});
