import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";
import type { ReviewerParamsType } from "./types";

const params: ReviewerParamsType = {
  diff_description: "git diff --staged",
  instructions: "Focus on correctness and regressions.",
};

const ctx = {} as ExtensionContext;

describe("reviewer prompt", () => {
  it.each([
    "gpt-6-luna",
    "gpt-6-sol",
  ])("builds a highest-impact review prompt for %s", (id) => {
    const result = buildPrompt(params, ctx, { provider: "openai-codex", id });

    expect(result.text).toContain("highest-impact findings");
    expect(result.text).toContain("Nobody can answer questions");
    expect(result.text).toContain("critical, high, medium, low");
    expect(result.text).toContain(params.diff_description);
    expect(result.text).toContain(params.instructions);
  });

  it("builds a concrete-bar review prompt for Claude Sonnet 5", () => {
    const result = buildPrompt(params, ctx, {
      provider: "anthropic",
      id: "claude-sonnet-5",
    });

    expect(result.text).toContain("every changed hunk");
    expect(result.text).toContain("including ones you are uncertain about");
    expect(result.text).toContain("your confidence");
    expect(result.text).not.toContain("highest-impact findings");
    expect(result.text).toContain(params.diff_description);
  });

  it("builds an evidence-contract review prompt for GLM-5.3-Flash", () => {
    const result = buildPrompt(params, ctx, {
      provider: "synthetic",
      id: "hf:zai-org/GLM-5.3-Flash",
    });

    expect(result.text).toContain("Evidence contract");
    expect(result.text).toContain("Cite concrete files and line ranges");
    expect(result.text).toContain(params.diff_description);
    expect(result.text).toContain(params.instructions);
  });

  it("uses the generic prompt for other models", () => {
    const result = buildPrompt(params, ctx, {
      provider: "anthropic",
      id: "claude-opus-5-5",
    });

    expect(result.text).not.toContain("Review contract");
    expect(result.text).not.toContain("Evidence contract");
    expect(result.text).toContain(params.diff_description);
  });
});
