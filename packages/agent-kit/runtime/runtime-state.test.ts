import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { SubagentRuntimeState } from "./runtime-state";

describe("SubagentRuntimeState", () => {
  it("records the session model and thinking level", () => {
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      model: { provider: "openrouter", id: "z-ai/glm-5.2" },
      thinkingLevel: "high",
    } as AgentSession;

    const state = new SubagentRuntimeState(session);

    expect(state.snapshot().model).toEqual({
      provider: "openrouter",
      model: "z-ai/glm-5.2",
      thinking: "high",
    });
  });

  it("resolves the physical model under a virtual selection", () => {
    const session = {
      sessionId: "session-id",
      sessionFile: "/tmp/session.jsonl",
      // Virtual (alias) selection served by a physical model.
      model: { provider: "pi-virtual", id: "fast", api: "pi-virtual" },
      thinkingLevel: "medium",
      routedModel: {
        model: { provider: "synthetic", id: "gpt-6.1-sol" },
        thinkingLevel: "high",
      },
    } as AgentSession;

    const state = new SubagentRuntimeState(session);

    expect(state.snapshot().model).toEqual({
      provider: "synthetic",
      model: "gpt-6.1-sol",
      thinking: "high",
    });
  });
});
