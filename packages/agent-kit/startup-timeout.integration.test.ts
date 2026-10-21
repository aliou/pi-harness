/**
 * Real-clock integration test for the startup timeout.
 *
 * `startup-timeout.test.ts` proves `withStartupTimeout`'s race logic with fake
 * timers. This proves the actual wiring used by `index.ts` — a real
 * `SubagentRuntime` driven by a real `setTimeout`-based stall — genuinely
 * rejects around the (very short, test-only) window instead of waiting out
 * the full stall, and genuinely does not cancel once streaming starts.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { runWithFailover } from "./failover";
import { ProviderCooldown, type SubagentModelChoice } from "./models";
import { SubagentRuntime } from "./runtime";
import { createStartupBudget, withStartupTimeout } from "./startup-timeout";
import type { ResolvedSubagentConfig } from "./types";

const Params = Type.Object({ task: Type.String() });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeConfig(): ResolvedSubagentConfig<typeof Params> {
  return {
    name: "scout",
    label: "Scout",
    description: "x",
    systemPrompt: "x",
    tools: [],
    modelPreferences: [],
    parameters: Params,
    buildPrompt: () => ({ text: "q" }),
  };
}

function choice(provider: string, model: string): SubagentModelChoice {
  return {
    model: { id: model, provider } as never,
    thinking: "off",
    preference: { provider, model, thinking: "off" },
    skipped: [],
  };
}

function successMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "Finished" }],
    api: "openai-completions",
    provider: "openrouter",
    model: "google/gemma-4-31b-it",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("withStartupTimeout + SubagentRuntime (real clock)", () => {
  it("rejects around a short real window instead of waiting out a stalled start", async () => {
    const STARTUP_TIMEOUT_MS = 50;
    const STALL_MS = 500; // explicitly longer than the window

    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "openrouter", id: "google/gemma-4-31b-it" },
      subscribe: vi.fn(() => vi.fn()),
      // Simulates a connect-but-no-tokens stall: the call is "in flight" but
      // emits no event before it eventually settles.
      prompt: vi.fn(() => sleep(STALL_MS)),
      getLastAssistantText: vi.fn(() => undefined),
      abort: vi.fn(),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const startedAt = Date.now();
    await expect(
      withStartupTimeout(
        (started) =>
          new SubagentRuntime(
            makeConfig(),
            session,
            undefined,
            started,
          ).execute(
            "call-id",
            { task: "x" },
            undefined,
            {} as ExtensionContext,
          ),
        "Scout",
        STARTUP_TIMEOUT_MS,
      ),
    ).rejects.toThrow(/Scout subagent did not start within 50ms/);
    const elapsedMs = Date.now() - startedAt;

    // Proves the race actually fired early rather than the test just
    // happening to observe the eventual (unrelated) stall completion.
    expect(elapsedMs).toBeLessThan(STALL_MS / 2);
  });

  it("does not reject once streaming starts, even once real time passes the window", async () => {
    const STARTUP_TIMEOUT_MS = 50;
    const STREAM_DELAY_MS = 5; // well before the window elapses
    const FINISH_DELAY_MS = 150; // pushes total past the window

    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const message = successMessage();
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "openrouter", id: "google/gemma-4-31b-it" },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        await sleep(STREAM_DELAY_MS);
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "thinking_start" },
        } as never);
        await sleep(FINISH_DELAY_MS);
        listener?.({ type: "message_end", message });
      }),
      getLastAssistantText: vi.fn(() => "Finished"),
      abort: vi.fn(),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const result = await withStartupTimeout(
      (started) =>
        new SubagentRuntime(makeConfig(), session, undefined, started).execute(
          "call-id",
          { task: "x" },
          undefined,
          {} as ExtensionContext,
        ),
      "Scout",
      STARTUP_TIMEOUT_MS,
    );

    expect(result.content).toBeDefined();
    expect(session.abort).not.toHaveBeenCalled();
  });
});

describe("runWithFailover + SubagentRuntime (real clock)", () => {
  it("abandons a stalled provider, answers on the next one, and cools the stalled one", async () => {
    const ATTEMPT_MS = 50;
    const STALL_MS = 2_000; // far longer than the attempt window

    const stalled = {
      sessionId: "stalled-session",
      sessionFile: "/tmp/stalled.jsonl",
      model: { provider: "neuralwatt", id: "gemma-4-31b" },
      subscribe: vi.fn(() => vi.fn()),
      // Connect-but-no-tokens: in flight, but nothing ever streams.
      prompt: vi.fn(() => sleep(STALL_MS)),
      getLastAssistantText: vi.fn(() => undefined),
      abort: vi.fn(),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const healthy = {
      sessionId: "healthy-session",
      sessionFile: "/tmp/healthy.jsonl",
      model: { provider: "synthetic", id: "flash" },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "thinking_start" },
        } as never);
        listener?.({ type: "message_end", message: successMessage() });
      }),
      getLastAssistantText: vi.fn(() => "Finished"),
      abort: vi.fn(),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const cooldown = new ProviderCooldown();
    const notes: string[] = [];
    const startedAt = Date.now();

    const outcome = await runWithFailover({
      label: "Read Session",
      candidates: [
        choice("neuralwatt", "gemma-4-31b"),
        choice("synthetic", "flash"),
      ],
      budget: createStartupBudget({ totalMs: 10_000, attemptMs: ATTEMPT_MS }),
      cooldown,
      notify: (message) => notes.push(message),
      runAttempt: ({ choice: attemptChoice, signal, started }) => {
        const session =
          attemptChoice.preference.provider === "neuralwatt"
            ? stalled
            : healthy;
        return new SubagentRuntime(
          makeConfig(),
          session,
          signal,
          started,
        ).execute("call-id", { task: "x" }, undefined, {} as ExtensionContext);
      },
    });

    expect(outcome.choice.preference.provider).toBe("synthetic");
    expect(outcome.attempted).toEqual([
      "neuralwatt/gemma-4-31b",
      "synthetic/flash",
    ]);
    // The whole run finished long before the stall would have settled.
    expect(Date.now() - startedAt).toBeLessThan(STALL_MS / 2);
    expect(notes).toEqual([
      "[model] neuralwatt/gemma-4-31b failed (no output), trying synthetic/flash",
    ]);
    expect(cooldown.isCooled("neuralwatt")).toBe(true);
    expect(cooldown.isCooled("synthetic")).toBe(false);
    // The abandoned attempt is told to stop rather than left streaming.
    expect(stalled.abort).toHaveBeenCalled();
  });
});
