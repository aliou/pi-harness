import type {
  ExtensionAPI,
  ExtensionUIContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createCommandContext } from "@harness/test-utils/pi-context";
import { afterEach, describe, expect, it, vi } from "vitest";

// Avoid real fs watchers and git subprocesses in the render test.
vi.mock("../lib/git-status", () => ({
  GitStatusWatcher: class {
    getStatus() {
      return { dirty: false, ahead: 0, behind: 0 };
    }
    dispose() {}
  },
}));

import {
  FAST_STATUS_CHANGED_EVENT,
  FAST_STATUS_REQUEST_EVENT,
  type FastStatusRequest,
} from "@harness/events";
import { FAST_MARK } from "../lib/model";
import { createCustomFooter } from "./footer";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function createFooterData(
  statuses?: Map<string, string>,
): ReadonlyFooterDataProvider {
  return {
    getGitBranch: () => null,
    getExtensionStatuses: () => statuses ?? new Map<string, string>(),
    getAvailableProviderCount: () => 1,
    onBranchChange: () => () => {},
  } as unknown as ReadonlyFooterDataProvider;
}

interface Captured {
  render(width: number): string[];
  dispose(): void;
}

interface Fixture {
  component: Captured;
  notify: (event: string, data: unknown) => void;
  dispose: () => void;
}

/**
 * Build a footer against the production crash inputs: branch cost $0.009 and
 * total cost $0.140, context 5% of a 200k window, model glm-5.2-short.
 */
function createFixture(
  options: { statuses?: Map<string, string>; fastAtSetup?: boolean } = {},
): Fixture {
  // First assistant entry is the branch leaf; getBranch() returns it so
  // branchCost diverges from totalCost and the stats line carries the
  // cumulative parenthetical — exactly the crashing output.
  const branchEntry = {
    type: "message",
    timestamp: new Date(0).toISOString(),
    message: {
      role: "assistant",
      api: "openai-completions",
      provider: "synthetic",
      model: "hf:zai-org/GLM-4.7-Flash",
      timestamp: 0,
      usage: {
        input: 100,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { total: 0.009 },
      },
    },
  };
  const totalEntry = {
    type: "message",
    message: {
      role: "assistant",
      usage: { input: 100, cacheRead: 0, cacheWrite: 0, cost: { total: 0.14 } },
    },
  };
  const branchEntries = [branchEntry];

  const handlers = new Map<string, ((data: unknown) => void)[]>();
  const pi = {
    events: {
      on: vi.fn((event: string, handler: (data: unknown) => void) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      }),
      emit: vi.fn((event: string, data: unknown) => {
        // Mimic rig's synchronous reply to a fast-status request.
        if (event === FAST_STATUS_REQUEST_EVENT && options.fastAtSetup) {
          (data as FastStatusRequest).reply({ enabled: true });
        }
      }),
    },
    getThinkingLevel: vi.fn(() => "off"),
  } as unknown as ExtensionAPI;

  let captured: Captured | undefined;
  const ctx = createCommandContext({
    model: {
      id: "glm-5.2-short",
      provider: "zai",
      contextWindow: 200_000,
      reasoning: false,
    } as never,
    entries: [branchEntry, totalEntry],
    branch: branchEntries,
    getContextUsage: () => ({
      contextWindow: 200_000,
      percent: 5,
      tokens: 9999,
    }),
    ui: {
      setFooter: ((factory) => {
        // cleanup() calls setFooter(undefined) to restore the default footer.
        if (typeof factory === "function") {
          captured = factory(
            {} as never,
            theme,
            createFooterData(options.statuses),
          ) as Captured;
        }
      }) as ExtensionUIContext["setFooter"],
    },
  });

  const footer = createCustomFooter(pi);
  footer.setup(ctx);

  if (!captured) throw new Error("footer component was not captured");
  const component = captured;

  return {
    component,
    notify: (event: string, data: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(data);
    },
    dispose: () => {
      component.dispose?.();
      footer.cleanup();
    },
  };
}

describe("custom footer width safety", () => {
  let fixture: Fixture;
  afterEach(() => fixture?.dispose());

  it("never emits a line wider than the terminal at width 40 (crash regression)", () => {
    fixture = createFixture();
    const lines = fixture.component.render(40);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });

  it("truncates hard when the stats line still exceeds a very narrow terminal", () => {
    fixture = createFixture();
    const lines = fixture.component.render(10);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(10);
    }
  });
});

describe("fast mode", () => {
  let fixture: Fixture;
  afterEach(() => fixture?.dispose());

  it("shows a thunderbolt before the model while fast mode is on", () => {
    fixture = createFixture();
    fixture.notify(FAST_STATUS_CHANGED_EVENT, {
      enabled: true,
      provider: "anthropic",
    });
    expect(fixture.component.render(120)[1]).toContain(
      `${FAST_MARK} zai/glm-5.2-short`,
    );
  });

  it("drops the thunderbolt when fast mode turns off", () => {
    fixture = createFixture();
    fixture.notify(FAST_STATUS_CHANGED_EVENT, { enabled: true });
    fixture.notify(FAST_STATUS_CHANGED_EVENT, { enabled: false });
    expect(fixture.component.render(120)[1]).not.toContain(FAST_MARK);
  });

  it("picks up fast mode enabled before the footer was set up", () => {
    fixture = createFixture({ fastAtSetup: true });
    expect(fixture.component.render(120)[1]).toContain(FAST_MARK);
  });

  it("ignores malformed status payloads", () => {
    fixture = createFixture();
    fixture.notify(FAST_STATUS_CHANGED_EVENT, "nope");
    expect(fixture.component.render(120)[1]).not.toContain(FAST_MARK);
  });
});

describe("extension statuses", () => {
  let fixture: Fixture;
  afterEach(() => fixture?.dispose());

  it("stays two lines when no extension set a status", () => {
    fixture = createFixture();
    expect(fixture.component.render(120)).toHaveLength(2);
  });

  it("renders statuses on a third line, sorted by key", () => {
    fixture = createFixture({
      statuses: new Map([
        ["zeta", "z-status"],
        ["alpha", "a-status"],
      ]),
    });
    const lines = fixture.component.render(120);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("a-status z-status");
  });

  it("sanitizes control characters out of status text", () => {
    fixture = createFixture({
      statuses: new Map([["a", "line one\nline\ttwo\r\n  spaced  "]]),
    });
    const lines = fixture.component.render(120);

    expect(lines[0]).toBe("line one line two spaced");
  });

  it("omits the third line when every status is empty", () => {
    fixture = createFixture({ statuses: new Map([["a", "   "]]) });
    expect(fixture.component.render(120)).toHaveLength(2);
  });

  it("never emits a status line wider than the terminal", () => {
    fixture = createFixture({
      statuses: new Map([["a", "x".repeat(200)]]),
    });
    for (const line of fixture.component.render(40)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });
});
