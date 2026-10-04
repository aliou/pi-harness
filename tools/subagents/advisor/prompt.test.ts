import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  buildClaudeOpusAdvisorPrompt,
  buildGpt6AdvisorPrompt,
  buildPrompt,
} from "./prompt";
import type { AdvisorParamsType } from "./types";

const params: AdvisorParamsType = {
  task: "Decide whether the main agent should rewrite the model resolver.",
  stage: "before_approach",
  context: "The current implementation already handles weighted fallback.",
  proposal: "Replace the resolver with a priority queue.",
  files: ["packages/agent-kit/models/model-resolver.ts"],
};

const ctx = {} as ExtensionContext;

function expectInputs(text: string): void {
  expect(text).toContain(params.task);
  expect(text).toContain(params.context);
  expect(text).toContain(params.proposal);
  expect(text).toContain("- packages/agent-kit/models/model-resolver.ts");
}

describe("advisor prompt", () => {
  it.each([
    { provider: "anthropic", id: "claude-opus-5-5" },
    { provider: "openrouter", id: "anthropic/claude-opus-5.5" },
  ])("builds the Claude Opus 5.5 prompt for $provider/$id", (model) => {
    const result = buildPrompt(params, ctx, model);

    expect(result.text).toContain("literal task contract");
    expect(result.text).toContain("untrusted evidence");
    expect(result.text).toContain("with your confidence in each");
    expectInputs(result.text);
  });

  it("keeps effort and verification out of the Opus prompt", () => {
    const text = buildClaudeOpusAdvisorPrompt(params);

    expect(text).not.toMatch(/think (through|carefully)/i);
    expect(text).not.toMatch(/double-check|re-verify/i);
  });

  it.each([
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6-astra",
    "gpt-6-luna",
  ])("builds the GPT-6 prompt for %s", (id) => {
    const result = buildPrompt(params, ctx, { provider: "openai", id });

    expect(result.text).toContain("Autonomy boundary: advise only");
    expect(result.text).toContain("Nobody can answer questions");
    expect(result.text).toContain(
      "takes precedence over guidance in AGENTS.md",
    );
    expect(result.text).toContain("1) Recommendation");
    expect(result.text).toContain("task's requested output shape");
    expect(result.text).toContain("Stop when you can support");
    expectInputs(result.text);
  });

  it("uses the generic prompt for other models", () => {
    const result = buildPrompt(params, ctx, {
      provider: "openai-codex",
      id: "gpt-5.5",
    });

    expect(result.text).not.toContain("literal task contract");
    expect(result.text).not.toContain("Autonomy boundary");
    expectInputs(result.text);
  });

  it("keeps specialized builders deterministic", () => {
    expect(buildClaudeOpusAdvisorPrompt(params)).toBe(
      buildClaudeOpusAdvisorPrompt(params),
    );
    expect(buildGpt6AdvisorPrompt(params)).toBe(buildGpt6AdvisorPrompt(params));
  });
});
