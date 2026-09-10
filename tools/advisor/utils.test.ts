import { describe, expect, it } from "vitest";
import { disablesAdvisorTools } from "./utils";

function model(id: string) {
  return { provider: "openai-codex", id };
}

describe("disablesAdvisorTools", () => {
  it.each([
    "gpt-5.6",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6",
    "gpt-6-astra",
    "gpt-6.1",
    "gpt-6-other-name",
    "GPT-6-ASTRA",
  ])("disables for gpt-5.6/gpt-6 family models: %s", (id) => {
    expect(disablesAdvisorTools(model(id))).toBe(true);
  });

  it.each([
    "gpt-5.5",
    "gpt-5.4-mini",
    "claude-opus-4-8",
    "glm-5.2",
  ])("keeps advisor for other models: %s", (id) => {
    expect(disablesAdvisorTools(model(id))).toBe(false);
  });

  it("keeps advisor when no model is selected", () => {
    expect(disablesAdvisorTools(undefined)).toBe(false);
  });
});
