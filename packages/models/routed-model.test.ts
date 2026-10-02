import { describe, expect, it } from "vitest";
import {
  type BranchEntryLike,
  effectiveModelIdentity,
  isVirtualModel,
} from "./routed-model";

function virtual(provider: string, id: string) {
  return { provider, id, api: "pi-virtual" };
}

function stateEntry(
  virtualProvider: string,
  virtualId: string,
  provider: string,
  modelId: string,
): BranchEntryLike {
  return {
    type: "custom",
    customType: "pi.virtual-model-state",
    data: {
      provider: virtualProvider,
      modelId: virtualId,
      state: { provider, modelId },
    },
  };
}

const OTHER_ENTRY: BranchEntryLike = { type: "model_change" };

describe("isVirtualModel", () => {
  it("detects virtual catalog entries by api", () => {
    expect(isVirtualModel(virtual("latest", "kimi"))).toBe(true);
    expect(isVirtualModel({ api: "openai" })).toBe(false);
    expect(isVirtualModel({})).toBe(false);
    expect(isVirtualModel(undefined)).toBe(false);
  });
});

describe("effectiveModelIdentity", () => {
  it("passes physical selections through", () => {
    const physical = { provider: "anthropic", id: "claude-opus-5-5" };
    expect(effectiveModelIdentity(physical, [])).toBe(physical);
    expect(effectiveModelIdentity(undefined, [OTHER_ENTRY])).toBeUndefined();
  });

  it("resolves the routed physical model from the sticky route state", () => {
    const branch = [
      stateEntry("latest", "claude-opus", "anthropic", "claude-opus-5-5"),
      OTHER_ENTRY,
    ];
    expect(
      effectiveModelIdentity(virtual("latest", "claude-opus"), branch),
    ).toEqual({
      provider: "anthropic",
      id: "claude-opus-5-5",
    });
  });

  it("uses the latest state entry for the virtual model", () => {
    const branch = [
      stateEntry("latest", "kimi", "neuralwatt", "kimi-k2.7"),
      stateEntry("latest", "kimi", "synthetic", "hf:moonshotai/kimi-k3"),
    ];
    expect(effectiveModelIdentity(virtual("latest", "kimi"), branch)).toEqual({
      provider: "synthetic",
      id: "hf:moonshotai/kimi-k3",
    });
  });

  it("ignores state entries of other virtual models", () => {
    const branch = [
      stateEntry("latest", "kimi", "synthetic", "hf:moonshotai/kimi-k3"),
      stateEntry("profile", "large", "neuralwatt", "kimi-k3"),
    ];
    expect(
      effectiveModelIdentity(virtual("latest", "claude-opus"), branch),
    ).toBeUndefined();
  });

  it("returns undefined for an alias that never answered on this branch", () => {
    expect(
      effectiveModelIdentity(virtual("latest", "gpt-sol"), [OTHER_ENTRY]),
    ).toBeUndefined();
    expect(
      effectiveModelIdentity(virtual("latest", "gpt-sol"), []),
    ).toBeUndefined();
  });
});
