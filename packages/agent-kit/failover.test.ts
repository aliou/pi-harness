import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { runWithFailover } from "./failover";
import type { SubagentModelChoice } from "./models";
import { ProviderCooldown } from "./models";
import { SubagentAttemptError } from "./runtime";
import { createStartupBudget } from "./startup-timeout";

function choice(provider: string, model: string): SubagentModelChoice {
  return {
    model: { id: model, provider } as never,
    thinking: "off",
    preference: { provider, model, thinking: "off" },
    skipped: [],
  };
}

function assistantError(errorMessage: string): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-completions",
    provider: "p",
    model: "m",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage,
    timestamp: 0,
  };
}

function attemptError(
  provider: string,
  model: string,
  errorMessage: string,
  overrides: { started?: boolean } = {},
) {
  return new SubagentAttemptError({
    phase: "prompt",
    started: overrides.started ?? false,
    aborted: false,
    cause: new Error(errorMessage),
    assistant: assistantError(errorMessage),
    provider,
    model,
    message: errorMessage,
  });
}

function harness(
  candidates: SubagentModelChoice[],
  runAttempt: Parameters<
    typeof runWithFailover<string, string>
  >[0]["runAttempt"],
  overrides: Partial<
    Parameters<typeof runWithFailover<string, string>>[0]
  > = {},
) {
  const notes: string[] = [];
  const settled: { provider: string; failed: boolean; owned?: string }[] = [];
  const cooldown = new ProviderCooldown();
  const promise = runWithFailover<string, string>({
    label: "Scout",
    candidates,
    budget: createStartupBudget(),
    cooldown,
    notify: (message) => notes.push(message),
    runAttempt,
    onSettled: ({ choice: settledChoice, failure, owned }) =>
      settled.push({
        provider: settledChoice.preference.provider,
        failed: Boolean(failure),
        owned,
      }),
    ...overrides,
  });
  return { promise, notes, settled, cooldown };
}

const ROSTER = [
  choice("neuralwatt", "gemma"),
  choice("synthetic", "flash"),
  choice("zai", "turbo"),
];

describe("runWithFailover", () => {
  it("returns the first attempt that answers", async () => {
    const runAttempt = vi.fn(async ({ started }) => {
      started();
      return "answer";
    });
    const { promise, notes, settled } = harness(ROSTER, runAttempt);

    await expect(promise).resolves.toMatchObject({
      result: "answer",
      attempted: ["neuralwatt/gemma"],
    });
    expect(runAttempt).toHaveBeenCalledOnce();
    expect(notes).toEqual([]);
    expect(settled).toEqual([{ provider: "neuralwatt", failed: false }]);
  });

  it("advances to the next candidate when a provider fails before output", async () => {
    const runAttempt = vi.fn(async ({ choice: attemptChoice, started }) => {
      if (attemptChoice.preference.provider === "neuralwatt") {
        throw attemptError("neuralwatt", "gemma", "402: payment required");
      }
      started();
      return "answer";
    });
    const { promise, notes, cooldown, settled } = harness(ROSTER, runAttempt);

    const outcome = await promise;
    expect(outcome.result).toBe("answer");
    expect(outcome.choice.preference.provider).toBe("synthetic");
    expect(outcome.attempted).toEqual(["neuralwatt/gemma", "synthetic/flash"]);
    expect(notes).toEqual([
      "[model] neuralwatt/gemma failed (quota), trying synthetic/flash",
    ]);
    expect(cooldown.isCooled("neuralwatt")).toBe(true);
    expect(settled).toEqual([
      { provider: "neuralwatt", failed: true },
      { provider: "synthetic", failed: false },
    ]);
  });

  it("falls through to later roster entries in ranking order", async () => {
    const runAttempt = vi.fn(async ({ choice: attemptChoice, started }) => {
      if (attemptChoice.preference.provider === "zai") {
        started();
        return "answer";
      }
      throw attemptError(
        attemptChoice.preference.provider,
        attemptChoice.preference.model,
        "503: service unavailable",
      );
    });
    const { promise } = harness(ROSTER, runAttempt);

    await expect(promise).resolves.toMatchObject({
      attempted: ["neuralwatt/gemma", "synthetic/flash", "zai/turbo"],
    });
  });

  it("skips the rest of a provider's entries after a provider-scoped failure", async () => {
    const candidates = [
      choice("neuralwatt", "gemma"),
      choice("neuralwatt", "other"),
      choice("synthetic", "flash"),
    ];
    const runAttempt = vi.fn(async ({ choice: attemptChoice, started }) => {
      if (attemptChoice.preference.provider === "neuralwatt") {
        throw attemptError("neuralwatt", "gemma", "402: payment required");
      }
      started();
      return "answer";
    });
    const { promise } = harness(candidates, runAttempt);

    await expect(promise).resolves.toMatchObject({
      attempted: ["neuralwatt/gemma", "synthetic/flash"],
    });
    expect(runAttempt).toHaveBeenCalledTimes(2);
  });

  it("rethrows a fatal failure without trying another model", async () => {
    const runAttempt = vi.fn(async ({ started }) => {
      started();
      throw attemptError("neuralwatt", "gemma", "503: died mid-stream", {
        started: true,
      });
    });
    const { promise } = harness(ROSTER, runAttempt);

    await expect(promise).rejects.toThrow("503: died mid-stream");
    expect(runAttempt).toHaveBeenCalledOnce();
  });

  it("keeps a session recorded when the attempt produced output", async () => {
    const runAttempt = vi.fn(async ({ started }) => {
      started();
      throw attemptError("neuralwatt", "gemma", "503: died mid-stream", {
        started: true,
      });
    });
    const { promise, settled } = harness(ROSTER, runAttempt);

    await expect(promise).rejects.toThrow();
    expect(settled).toEqual([{ provider: "neuralwatt", failed: true }]);
  });

  it("reports every attempted model when the whole ranking fails", async () => {
    const runAttempt = vi.fn(async ({ choice: attemptChoice }) => {
      throw attemptError(
        attemptChoice.preference.provider,
        attemptChoice.preference.model,
        "503: service unavailable",
      );
    });
    const { promise, notes } = harness(ROSTER, runAttempt);

    await expect(promise).rejects.toThrow(
      /every candidate failed \(tried neuralwatt\/gemma, synthetic\/flash, zai\/turbo\)/,
    );
    expect(notes.at(-1)).toBe(
      "[model] zai/turbo failed (transient), no candidates left",
    );
  });

  it("stops walking the ranking once the startup budget is spent", async () => {
    let now = 0;
    const budget = createStartupBudget({
      totalMs: 60,
      attemptMs: 25,
      now: () => now,
    });
    const runAttempt = vi.fn(async ({ choice: attemptChoice }) => {
      now += 25;
      throw attemptError(
        attemptChoice.preference.provider,
        attemptChoice.preference.model,
        "503: service unavailable",
      );
    });
    const { promise } = harness(
      [...ROSTER, choice("openrouter", "gemma-it")],
      runAttempt,
      { budget },
    );

    await expect(promise).rejects.toThrow(/startup budget exhausted/);
    // Windows are 25ms, 25ms, then the 10ms left of the budget; the fourth
    // candidate gets nothing. Stalls cannot each consume a full window.
    expect(runAttempt).toHaveBeenCalledTimes(3);
  });

  it("gives every attempt the shorter of the attempt window and the budget", async () => {
    let now = 0;
    const budget = createStartupBudget({
      totalMs: 40,
      attemptMs: 25,
      now: () => now,
    });
    expect(budget.nextWindow()).toBe(25);
    now = 20;
    expect(budget.nextWindow()).toBe(20);
    now = 40;
    expect(budget.nextWindow()).toBe(0);
    budget.markStarted();
    expect(budget.nextWindow()).toBe(Number.POSITIVE_INFINITY);
  });

  it("does not start another attempt after the parent aborts", async () => {
    const controller = new AbortController();
    const runAttempt = vi.fn(async ({ choice: attemptChoice }) => {
      controller.abort();
      throw attemptError(
        attemptChoice.preference.provider,
        attemptChoice.preference.model,
        "503: service unavailable",
      );
    });
    const { promise } = harness(ROSTER, runAttempt, {
      signal: controller.signal,
    });

    await expect(promise).rejects.toThrow();
    expect(runAttempt).toHaveBeenCalledOnce();
  });

  it("attributes a late-created resource to the attempt that created it", async () => {
    // Attempt one is abandoned while still in setup, then finishes setup after
    // the loop has moved on. Its resource must settle under its own choice,
    // not under the attempt that replaced it.
    let releaseSetup: (() => void) | undefined;
    const runAttempt = vi.fn(
      async ({ choice: attemptChoice, started, own }) => {
        if (attemptChoice.preference.provider === "neuralwatt") {
          await new Promise<void>((resolve) => {
            releaseSetup = resolve;
          });
          own("neuralwatt-session");
          throw attemptError("neuralwatt", "gemma", "402: payment required");
        }
        own("synthetic-session");
        started();
        return "answer";
      },
    );
    const { promise, settled } = harness(ROSTER, runAttempt, {
      budget: createStartupBudget({ totalMs: 1_000, attemptMs: 5 }),
    });

    await expect(promise).resolves.toMatchObject({ result: "answer" });
    releaseSetup?.();
    await vi.waitFor(() => expect(settled).toHaveLength(3));

    expect(settled[0]).toEqual({
      provider: "neuralwatt",
      failed: true,
      owned: undefined,
    });
    expect(settled[1]).toEqual({
      provider: "synthetic",
      failed: false,
      owned: "synthetic-session",
    });
    // Late arrival re-settles under neuralwatt so the caller can discard it.
    expect(settled[2]).toEqual({
      provider: "neuralwatt",
      failed: true,
      owned: "neuralwatt-session",
    });
  });

  it("tells an abandoned attempt to stop", async () => {
    const seen: AbortSignal[] = [];
    const runAttempt = vi.fn(
      async ({ choice: attemptChoice, signal, started }) => {
        seen.push(signal);
        if (attemptChoice.preference.provider === "neuralwatt") {
          throw attemptError("neuralwatt", "gemma", "402: payment required");
        }
        started();
        return "answer";
      },
    );
    const { promise } = harness(ROSTER, runAttempt);

    await promise;
    expect(seen[0]?.aborted).toBe(true);
    expect(seen[1]?.aborted).toBe(false);
  });
});
