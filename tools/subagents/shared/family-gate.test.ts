import { describe, expect, it } from "vitest";
import {
  aliasDisablesAdvisoryTools,
  disablesAdvisoryTools,
} from "./family-gate";

function model(id: string) {
  return { provider: "openai", id };
}

describe("disablesAdvisoryTools", () => {
  it.each([
    "gpt-5.6",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6",
    "gpt-6-astra",
    "gpt-6.1",
    "gpt-6.1-sol",
    "openai/gpt-6.1-sol",
    "gpt-6-other-name",
    "GPT-6-ASTRA",
  ])("disables for gpt-5.6/gpt-6 family models: %s", (id) => {
    expect(disablesAdvisoryTools(model(id))).toBe(true);
  });

  it.each([
    "gpt-5.5",
    "gpt-60",
    "gpt-5.60",
    "gpt-6.1sol",
    "gpt-5.4-mini",
    "claude-opus-4-8",
    "glm-5.2",
  ])("keeps tools for other models: %s", (id) => {
    expect(disablesAdvisoryTools(model(id))).toBe(false);
  });

  it("keeps tools when no model is selected", () => {
    expect(disablesAdvisoryTools(undefined)).toBe(false);
  });
});

describe("aliasDisablesAdvisoryTools", () => {
  it("disables for gpt aliases on latest and fast", () => {
    expect(
      aliasDisablesAdvisoryTools({ provider: "latest", id: "gpt-sol" }),
    ).toBe(true);
    expect(
      aliasDisablesAdvisoryTools({ provider: "latest", id: "gpt-astra" }),
    ).toBe(true);
    expect(
      aliasDisablesAdvisoryTools({ provider: "fast", id: "gpt-luna" }),
    ).toBe(true);
  });

  it("keeps tools for aliases that pin other families", () => {
    for (const id of [
      "claude-opus",
      "kimi",
      "glm",
      "glm-flash",
      "deepseek-flash",
      "qwen-27b",
    ]) {
      expect(aliasDisablesAdvisoryTools({ provider: "latest", id })).toBe(
        false,
      );
    }
  });

  it("leaves mixed rosters and physical selections undecided", () => {
    expect(
      aliasDisablesAdvisoryTools({ provider: "agents", id: "advisor" }),
    ).toBeUndefined();
    expect(
      aliasDisablesAdvisoryTools({ provider: "openai", id: "gpt-6.1-sol" }),
    ).toBeUndefined();
    expect(aliasDisablesAdvisoryTools(undefined)).toBeUndefined();
  });
});
