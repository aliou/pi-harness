import type { Theme } from "@earendil-works/pi-coding-agent";
import { createCommandContext } from "@harness/test-utils/pi-context";
import { assert, describe, expect, it } from "vitest";
import {
  buildMinimalStatsParts,
  buildStatsParts,
  getContextUsage,
} from "./stats";

const theme = {
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

const usage = {
  totalCost: 0.1234,
  branchCost: 0.1234,
};

const contextUsage = {
  window: 272_000,
  percent: 10,
  colorPercent: 10,
  display: "10.0% 27.2k/272k",
};

describe("getContextUsage", () => {
  it("displays the real window but color-calibrates large windows", () => {
    const ctx = createCommandContext({
      model: { contextWindow: 1_000_000 } as never,
      getContextUsage: () => ({
        contextWindow: 1_000_000,
        percent: 10,
        tokens: 100_000,
      }),
    });

    const result = getContextUsage(ctx);

    assert(result, "context usage should exist");
    expect(result.window).toBe(1_000_000);
    expect(result.percent).toBe(10);
    expect(result.colorPercent).toBeCloseTo(36.76, 2);
    expect(result.display).toBe("10.0% 100k/1.0M");
  });

  it("hides a window that belongs to another model", () => {
    const ctx = createCommandContext({
      getContextUsage: () => ({
        contextWindow: 1_000_000,
        percent: 10,
        tokens: 100_000,
      }),
    });

    const result = getContextUsage(ctx, false);

    assert(result, "context usage should exist");
    expect(result.display).toBe("? 100k/?");
    expect(result.colorPercent).toBe(0);
  });
});

describe("buildStatsParts", () => {
  it("shows cost and context usage", () => {
    expect(buildStatsParts(theme, usage, contextUsage)).toEqual([
      "$0.123 10.0% 27.2k/272k",
    ]);
  });
});

describe("buildMinimalStatsParts", () => {
  // Mirrors the production crash inputs (terminal width 40): the full stats
  // line with a cumulative-cost parenthetical was too wide for the viewport.
  // Minimal mode must drop the parenthetical.
  const splitUsage = {
    totalCost: 0.14,
    branchCost: 0.009,
  };

  const splitContextUsage = {
    window: 200_000,
    percent: 5,
    colorPercent: 5,
    display: "5.0% 10.0k/200k",
  };

  it("drops the cumulative-cost parenthetical", () => {
    expect(
      buildMinimalStatsParts(theme, splitUsage, splitContextUsage),
    ).toEqual(["$0.009 5.0% 10.0k/200k"]);
  });

  it("is narrower than the full stats line", () => {
    const full =
      buildStatsParts(theme, splitUsage, splitContextUsage)[0]?.length ?? 0;
    const minimal =
      buildMinimalStatsParts(theme, splitUsage, splitContextUsage)[0]?.length ??
      0;
    expect(minimal).toBeLessThan(full);
  });

  it("wraps the whole line in error color above the error threshold", () => {
    const errorTheme = {
      fg: (color: string, text: string) =>
        color === "error" ? `[err]${text}` : text,
    } as unknown as Theme;
    const overError = {
      ...splitContextUsage,
      percent: 60,
      colorPercent: 60,
      display: "60.0% 10.0k/200k",
    };
    expect(buildMinimalStatsParts(errorTheme, splitUsage, overError)).toEqual([
      "[err]$0.009 60.0% 10.0k/200k",
    ]);
  });
});
