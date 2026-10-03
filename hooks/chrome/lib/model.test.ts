import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  buildModelIdLine,
  buildModelLine,
  FAST_MARK,
  findRoutedModel,
  formatRoutedModel,
} from "./model";

const theme = { fg: (_color: string, text: string) => text } as Theme;

function response(provider: string, model: string, stopReason = "stop") {
  return {
    type: "message",
    message: { role: "assistant", provider, model, stopReason },
  };
}

const modelChange = { type: "model_change" };
const VIRTUAL = { api: "pi-virtual" };

describe("findRoutedModel", () => {
  it("ignores physical selections", () => {
    expect(
      findRoutedModel({ api: "anthropic-messages" }, [
        response("anthropic", "claude-opus-5-5"),
      ]),
    ).toBeUndefined();
  });

  it("returns the latest successful response", () => {
    const branch = [
      modelChange,
      response("openai", "gpt-6-sol"),
      { type: "message", message: { role: "user" } },
      response("anthropic", "anthropic-oauth/claude-opus-5-5"),
      response("anthropic", "claude-opus-5", "error"),
      response("anthropic", "claude-opus-5", "aborted"),
    ];

    expect(findRoutedModel(VIRTUAL, branch)).toEqual({
      provider: "anthropic",
      modelId: "anthropic-oauth/claude-opus-5-5",
    });
  });

  it("ignores responses from before the switch", () => {
    const branch = [response("neuralwatt", "glm-5.3-flash"), modelChange];

    expect(findRoutedModel(VIRTUAL, branch)).toBeUndefined();
  });
});

describe("formatRoutedModel", () => {
  const available = [
    { provider: "anthropic", id: "claude-opus-5-5" },
    { provider: "neuralwatt", id: "kimi-k3" },
    { provider: "neuralwatt", id: "kimi-k3-fast" },
    { provider: "synthetic", id: "hf:moonshotai/Kimi-K3" },
  ];

  it("shows the bare id when one provider serves the model", () => {
    const routed = {
      provider: "anthropic",
      modelId: "anthropic-oauth/claude-opus-5-5",
    };

    expect(formatRoutedModel(routed, available)).toBe("claude-opus-5-5");
  });

  it("adds the provider when several providers serve the model", () => {
    const routed = { provider: "synthetic", modelId: "hf:moonshotai/Kimi-K3" };

    expect(formatRoutedModel(routed, available)).toBe("synthetic/Kimi-K3");
  });
});

describe("buildModelLine", () => {
  it("appends the routed model after the selection", () => {
    expect(
      buildModelLine(
        theme,
        "alias",
        "claude-opus",
        true,
        "high",
        "claude-opus-5-5",
      ),
    ).toBe("alias/claude-opus → claude-opus-5-5:hig");
  });

  it("prefixes a thunderbolt while fast mode is on", () => {
    expect(
      buildModelLine(
        theme,
        "anthropic",
        "claude-opus-5-5",
        true,
        "high",
        undefined,
        true,
      ),
    ).toBe(`${FAST_MARK} anthropic/claude-opus-5-5:hig`);
  });
});

describe("buildModelIdLine", () => {
  it("prefixes a thunderbolt while fast mode is on", () => {
    expect(buildModelIdLine(theme, "claude-opus-5-5", true)).toBe(
      `${FAST_MARK} claude-opus-5-5`,
    );
  });

  it("renders the bare id while fast mode is off", () => {
    expect(buildModelIdLine(theme, "claude-opus-5-5")).toBe("claude-opus-5-5");
  });
});
