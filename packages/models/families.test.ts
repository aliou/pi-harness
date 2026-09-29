import { describe, expect, it } from "vitest";
import { knownModelFamily, type ModelIdentity, modelKey } from "./families";

function model(provider: string, id: string): ModelIdentity {
  return { provider, id };
}

describe("model family helpers", () => {
  it("formats model keys", () => {
    expect(modelKey(model("openai", "gpt-6.1-sol"))).toBe("openai/gpt-6.1-sol");
  });

  it.each([
    model("openai", "gpt-6.1-sol"),
    model("openrouter", "openai/gpt-6.1-sol"),
    model("openai", "gpt-6.1"),
    model("openai", "gpt-6-astra"),
    model("openai-codex", "gpt-6-sol"),
    model("openai-codex", "gpt-6-luna"),
    model("openai-codex", "gpt-6-astra"),
    model("openrouter", "openai/gpt-6-sol"),
  ])("recognizes GPT-6 variants: $provider/$id", (candidate) => {
    expect(knownModelFamily(candidate)).toBe("gpt-6");
  });

  it.each([
    model("anthropic", "claude-opus-5-5"),
    model("openrouter", "anthropic/claude-opus-5.5"),
  ])("recognizes Claude Opus 5.5: $provider/$id", (candidate) => {
    expect(knownModelFamily(candidate)).toBe("claude-opus-5.5");
  });

  it("recognizes Claude Sonnet 5", () => {
    expect(knownModelFamily(model("anthropic", "claude-sonnet-5"))).toBe(
      "claude-sonnet-5",
    );
  });

  it.each([
    model("neuralwatt", "glm-5.3"),
    model("neuralwatt", "glm-5.3-flash"),
    model("neuralwatt", "glm-5.3-flash-flex"),
    model("synthetic", "hf:zai-org/GLM-5.3-Flash"),
  ])("recognizes GLM-5.3 variants: $provider/$id", (candidate) => {
    expect(knownModelFamily(candidate)).toBe("glm-5.3");
  });

  it.each([
    model("anthropic", "claude-opus-5"),
    model("anthropic", "claude-sonnet-5-5"),
    model("openai-codex", "gpt-5.6-sol"),
    model("openai", "gpt-60"),
    model("openai", "gpt-6.1sol"),
    model("openai", "gpt-6.x-sol"),
    model("neuralwatt", "glm-5.2"),
    model("neuralwatt", "deepseek-v4.1-flash"),
  ])("returns undefined for other models: $provider/$id", (candidate) => {
    expect(knownModelFamily(candidate)).toBe(undefined);
  });
});
