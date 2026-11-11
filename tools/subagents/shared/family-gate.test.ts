import { describe, expect, it } from "vitest";
import {
  advisoryUnavailableReason,
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

describe("advisoryUnavailableReason", () => {
  const physical = (id: string) => ({ provider: "openai", id, api: "openai" });

  it("explains unavailability for gated physical models", () => {
    expect(advisoryUnavailableReason(physical("gpt-6.1-sol"), [])).toContain(
      "advisor and oracle are not available for openai/gpt-6.1-sol",
    );
  });

  it("is undefined for other physical models", () => {
    expect(advisoryUnavailableReason(physical("claude-opus"), [])).toBe(
      undefined,
    );
  });

  it("is undefined when no model is selected or the alias has not routed", () => {
    expect(advisoryUnavailableReason(undefined, [])).toBeUndefined();
    expect(
      advisoryUnavailableReason({ provider: "latest", id: "gpt-sol" }, []),
    ).toBeUndefined();
  });
});
