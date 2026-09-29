import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  buildClaudeOpusOraclePrompt,
  buildGlmOraclePrompt,
  buildGptOraclePrompt,
  buildPrompt,
} from "./prompt";
import type { OracleParamsType } from "./types";

const params: OracleParamsType = {
  task: "Design model-specific prompt compilation.",
  context: "Primary and fallback subagent models can differ.",
  files: ["packages/agent-kit/types.ts", "tools/oracle/prompt.ts"],
};

const ctx = {} as ExtensionContext;

describe("oracle prompt", () => {
  it.each([
    "gpt-6-sol",
    "gpt-6-luna",
  ])("builds an outcome-first prompt for %s", (id) => {
    const result = buildPrompt(params, ctx, { provider: "openai-codex", id });

    expect(result.text).toContain("outcome-first advisory shape");
    expect(result.text).toContain("Nobody can answer questions");
    expect(result.text).toContain(params.task);
    expect(result.text).toContain(params.context);
    expect(result.text).toContain("- packages/agent-kit/types.ts");
  });

  it("builds a scoped prompt for Claude Opus 5.5", () => {
    const result = buildPrompt(params, ctx, {
      provider: "anthropic",
      id: "claude-opus-5-5",
    });

    expect(result.text).toContain("at the scope intended");
    expect(result.text).toContain("untrusted evidence");
    expect(result.text).toContain(params.task);
  });

  it.each([
    "hf:zai-org/GLM-5.3-Flash",
    "glm-5.3",
  ])("builds a bounded task-first prompt for %s", (id) => {
    const result = buildPrompt(params, ctx, { provider: "synthetic", id });

    expect(result.text).toContain("Answer the requested decision");
    expect(result.text).toContain("Follow the task's requested answer shape");
    expect(result.text).toContain("not found");
    expect(result.text).not.toContain("Cite concrete files and line ranges");
    expect(result.text).not.toContain("Desired output:");
    expect(result.text).toContain("- tools/oracle/prompt.ts");
  });

  it("uses the generic prompt for other models", () => {
    const result = buildPrompt(params, ctx, {
      provider: "anthropic",
      id: "claude-opus-4-8",
    });

    expect(result.text).not.toContain("outcome-first advisory shape");
    expect(result.text).not.toContain("Answer the requested decision");
    expect(result.text).not.toContain("at the scope intended");
    expect(result.text).toContain(params.task);
    expect(result.text).toContain(params.context);
  });

  it("keeps specialized builders deterministic", () => {
    expect(buildGptOraclePrompt(params)).toBe(buildGptOraclePrompt(params));
    expect(buildGlmOraclePrompt(params)).toBe(buildGlmOraclePrompt(params));
    expect(buildClaudeOpusOraclePrompt(params)).toBe(
      buildClaudeOpusOraclePrompt(params),
    );
  });
});
