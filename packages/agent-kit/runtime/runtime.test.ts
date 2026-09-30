import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedSubagentConfig } from "../types";
import { isSubagentAttemptError } from "./attempt";
import { SubagentOutputSchema } from "./output";
import { SubagentRuntime } from "./runtime";

const Params = Type.Object({ task: Type.String() });

function overflowMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-codex-responses",
    provider: "openai-codex",
    model: "gpt-5.5",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "error",
    errorMessage: "Your input exceeds the context window of this model.",
    timestamp: 0,
  };
}

function successMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "Finished" }],
    api: "openai-codex-responses",
    provider: "openai-codex",
    model: "gpt-5.5",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 18,
      cost: {
        input: 0.1,
        output: 0.2,
        cacheRead: 0.01,
        cacheWrite: 0.02,
        total: 0.33,
      },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

describe("SubagentRuntime", () => {
  const makeConfig = (
    overrides: Partial<ResolvedSubagentConfig<typeof Params>> = {},
  ): ResolvedSubagentConfig<typeof Params> => ({
    name: "reviewer",
    label: "Reviewer",
    description: "Review code",
    systemPrompt: "Review code",
    tools: [],
    modelPreferences: [],
    configured: true,
    parameters: Params,
    buildPrompt: () => ({ text: "Review this diff" }),
    ...overrides,
  });
  it("returns nested model usage for parent session accounting", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const message = successMessage();
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: {
        provider: "openai-codex",
        id: "gpt-5.5",
      },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({ type: "message_end", message });
      }),
      getLastAssistantText: vi.fn(() => "Finished"),
      dispose: vi.fn(),
    } as unknown as AgentSession;
    const config: ResolvedSubagentConfig<typeof Params> = {
      name: "reviewer",
      label: "Reviewer",
      description: "Review code",
      systemPrompt: "Review code",
      tools: [],
      modelPreferences: [],
      configured: true,
      parameters: Params,
      buildPrompt: () => ({ text: "Review this diff" }),
    };

    const runtime = new SubagentRuntime(config, session, undefined);
    const result = await runtime.execute(
      "call-id",
      { task: "review" },
      undefined,
      {} as ExtensionContext,
    );

    expect(result.usage).toEqual(message.usage);
    expect(result.details.usage).toEqual(message.usage);
  });

  it("returns the response, session, model, and usage as structured content", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const message = successMessage();
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "openai-codex", id: "gpt-5.5" },
      thinkingLevel: "high",
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({ type: "message_end", message });
      }),
      getLastAssistantText: vi.fn(() => "Finished"),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const runtime = new SubagentRuntime(
      makeConfig({ resumable: true }),
      session,
      undefined,
    );
    const result = await runtime.execute(
      "call-id",
      { task: "review" },
      undefined,
      {} as ExtensionContext,
    );

    // The model sees the resume footer; scripts get the bare response.
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("call resume_reviewer"),
    });
    expect(
      Value.Errors(SubagentOutputSchema, result.structuredContent),
    ).toEqual([]);
    expect(result.structuredContent).toEqual({
      response: "Finished",
      sessionId: "session-id",
      resumable: true,
      model: { provider: "openai-codex", model: "gpt-5.5", thinking: "high" },
      status: "success",
      usage: message.usage,
    });
  });

  it("fails a blank context-overflow response", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: {
        provider: "openai-codex",
        id: "gpt-5.5",
      },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({ type: "message_end", message: overflowMessage() });
      }),
      getLastAssistantText: vi.fn(() => undefined),
      dispose: vi.fn(),
    } as unknown as AgentSession;
    const config: ResolvedSubagentConfig<typeof Params> = {
      name: "reviewer",
      label: "Reviewer",
      description: "Review code",
      systemPrompt: "Review code",
      tools: [],
      modelPreferences: [],
      configured: true,
      parameters: Params,
      buildPrompt: () => ({ text: "Review this diff" }),
    };

    const runtime = new SubagentRuntime(config, session, undefined);

    await expect(
      runtime.execute(
        "call-id",
        { task: "review" },
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow(
      "Start a new reviewer call with a narrower scope; do not call resume_reviewer",
    );
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("fails a partial response that ended in a provider error", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const partial: AssistantMessage = {
      ...successMessage(),
      content: [{ type: "text", text: "Here is half an ans" }],
      stopReason: "error",
      errorMessage: "502: upstream closed the connection",
    };
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "openai-codex", id: "gpt-5.5" },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({ type: "message_end", message: partial });
      }),
      getLastAssistantText: vi.fn(() => "Here is half an ans"),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const runtime = new SubagentRuntime(makeConfig(), session, undefined);

    await expect(
      runtime.execute(
        "call-id",
        { task: "review" },
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow("502: upstream closed the connection");
  });

  it("reports the failure phase, start state, and model for the failover loop", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "neuralwatt", id: "gemma-4-31b" },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({
          type: "message_end",
          message: {
            ...successMessage(),
            content: [],
            stopReason: "error",
            errorMessage: "402: payment required",
          },
        });
      }),
      getLastAssistantText: vi.fn(() => undefined),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const runtime = new SubagentRuntime(makeConfig(), session, undefined);
    const error = await runtime
      .execute("call-id", { task: "review" }, undefined, {} as ExtensionContext)
      .catch((err: unknown) => err);

    expect(isSubagentAttemptError(error)).toBe(true);
    if (!isSubagentAttemptError(error)) return;
    expect(error.failure).toMatchObject({
      phase: "blank-response",
      started: false,
      aborted: false,
      provider: "neuralwatt",
      model: "gemma-4-31b",
    });
    expect(error.failure.assistant?.errorMessage).toBe("402: payment required");
  });

  it("marks a failure as started once output has streamed", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "neuralwatt", id: "gemma-4-31b" },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "thinking_start" },
        } as never);
        listener?.({
          type: "message_end",
          message: {
            ...successMessage(),
            content: [],
            stopReason: "error",
            errorMessage: "503: upstream died mid-stream",
          },
        });
      }),
      getLastAssistantText: vi.fn(() => undefined),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const runtime = new SubagentRuntime(makeConfig(), session, undefined);
    const error = await runtime
      .execute("call-id", { task: "review" }, undefined, {} as ExtensionContext)
      .catch((err: unknown) => err);

    expect(isSubagentAttemptError(error) && error.failure.started).toBe(true);
  });

  it("invokes onStarted once on the first streaming event", async () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    let resolvePrompt: (() => void) | undefined;
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "openai-codex", id: "gpt-5.5" },
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      prompt: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolvePrompt = resolve;
          }),
      ),
      getLastAssistantText: vi.fn(() => "Finished"),
      abort: vi.fn(),
      dispose: vi.fn(),
    } as unknown as AgentSession;

    const onStarted = vi.fn();
    const runtime = new SubagentRuntime(
      makeConfig(),
      session,
      undefined,
      onStarted,
    );
    const promise = runtime.execute(
      "call-id",
      { task: "x" },
      undefined,
      {} as ExtensionContext,
    );
    // Let execute reach `await session.prompt` so the subscription is wired.
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toBeDefined();

    // Not yet started.
    expect(onStarted).not.toHaveBeenCalled();

    // First streaming event fires onStarted once; a second event does not.
    listener?.({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_start" },
    } as never);
    listener?.({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "hi" },
    } as never);
    expect(onStarted).toHaveBeenCalledOnce();

    resolvePrompt?.();
    await expect(promise).resolves.toBeDefined();
  });
});
