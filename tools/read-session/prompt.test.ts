import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";
import type { ReadSessionParamsType } from "./types";

const params: ReadSessionParamsType = {
  targetSessionId: "019f4c6f",
  goal: "Extract the final database decision and the test command that ran.",
};

const ctx = {} as ExtensionContext;

describe("read-session prompt", () => {
  it.each([
    { provider: "synthetic", id: "hf:zai-org/GLM-5.3-Flash" },
    { provider: "neuralwatt", id: "glm-5.3-flash" },
  ])("builds a bounded research prompt for $provider/$id", (model) => {
    const result = buildPrompt(params, ctx, model);

    expect(result.text).toContain("bounded session research task");
    expect(result.text).toContain("direct evidence from inference");
    expect(result.text).toContain(params.targetSessionId);
    expect(result.text).toContain(params.goal);
  });

  it("uses the generic prompt for DeepSeek V4.1 Flash", () => {
    const result = buildPrompt(params, ctx, {
      provider: "neuralwatt",
      id: "deepseek-v4.1-flash",
    });

    expect(result.text).not.toContain("bounded session research task");
    expect(result.text).toContain(params.targetSessionId);
    expect(result.text).toContain(params.goal);
  });
});
