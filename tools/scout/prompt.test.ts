import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";
import type { ScoutParamsType } from "./types";

const params: ScoutParamsType = {
  query: "Trace the model resolver fallback path.",
  cwd: "/tmp/pi-harness",
  context: "Inspect only packages/agent-kit and packages/models.",
};

const ctx = {} as ExtensionContext;

describe("scout prompt", () => {
  it.each([
    { provider: "synthetic", id: "hf:zai-org/GLM-5.3-Flash" },
    { provider: "neuralwatt", id: "glm-5.3" },
  ])("uses the generic prompt for $provider/$id", (model) => {
    const result = buildPrompt(params, ctx, model);

    expect(result.text).not.toContain("bounded local codebase research task");
    expect(result.text).toContain(params.query);
    expect(result.text).toContain(params.cwd);
    expect(result.text).toContain(params.context);
  });

  it("uses the generic prompt for DeepSeek V4.1 Flash", () => {
    const result = buildPrompt(params, ctx, {
      provider: "neuralwatt",
      id: "deepseek-v4.1-flash",
    });

    expect(result.text).not.toContain("bounded local codebase research task");
    expect(result.text).toContain(params.query);
    expect(result.text).toContain(params.context);
  });
});
