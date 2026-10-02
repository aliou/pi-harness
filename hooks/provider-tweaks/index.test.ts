import { createCommandContext } from "@harness/test-utils/pi-context";
import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { assert, describe, expect, it } from "vitest";
import providerTweaks from "./index";

async function request(provider: string, model = "gpt-6.1-sol") {
  const pi = await createPiTestHarness(providerTweaks);
  const handler = pi.extension.handlers.get("before_provider_request")?.[0];
  assert(handler, "before_provider_request should be registered");
  const payload = { model, reasoning: { effort: "high", summary: "auto" } };
  const ctx = createCommandContext({
    model: { provider, id: model } as NonNullable<
      Parameters<typeof createCommandContext>[0]
    >["model"],
  });
  return {
    payload,
    result: await handler({ type: "before_provider_request", payload }, ctx),
  };
}

describe("OpenAI provider tweaks", () => {
  it.each([
    "openai",
    "openai-codex",
  ])("requests detailed reasoning summaries on %s", async (provider) => {
    const { payload, result } = await request(provider);
    expect(result).toEqual({
      ...payload,
      reasoning: { effort: "high", summary: "detailed" },
    });
    expect(payload.reasoning.summary).toBe("auto");
  });

  it("applies to any model id carrying a reasoning payload", async () => {
    const { result } = await request("openai", "gpt-5.6-sol");
    expect(result).toEqual({
      model: "gpt-5.6-sol",
      reasoning: { effort: "high", summary: "detailed" },
    });
  });

  it("does not alter requests without a reasoning payload", async () => {
    const pi = await createPiTestHarness(providerTweaks);
    const handler = pi.extension.handlers.get("before_provider_request")?.[0];
    assert(handler, "before_provider_request should be registered");
    const payload = { model: "gpt-6.1-sol" };
    const ctx = createCommandContext({
      model: { provider: "openai", id: "gpt-6.1-sol" } as NonNullable<
        Parameters<typeof createCommandContext>[0]
      >["model"],
    });
    const result = await handler(
      { type: "before_provider_request", payload },
      ctx,
    );
    expect(result).toBe(payload);
  });

  it("does not alter requests to other providers", async () => {
    const { result } = await request("synthetic");
    expect(result).toBeUndefined();
  });
});
