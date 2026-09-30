import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRouteRequest } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { type AliasState, createAliasRoute, type RouteRegistry } from "./route";
import { ALIASES } from "./table";

const FOUND = ALIASES.find((alias) => alias.id === "kimi-k3");
if (!FOUND) throw new Error("kimi-k3 alias missing from table");
const DEFINITION = FOUND;

function fakeModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

function fakeRegistry(options: {
  authed?: string[];
  models?: [string, string][];
}): RouteRegistry {
  const authed = new Set(options.authed ?? []);
  const models = new Set(
    (options.models ?? []).map(([provider, id]) => `${provider}/${id}`),
  );
  return {
    find: (provider, modelId) =>
      models.has(`${provider}/${modelId}`)
        ? fakeModel(provider, modelId)
        : undefined,
    hasConfiguredAuth: (model) => authed.has(model.provider),
  };
}

function request(
  overrides: Partial<ModelRouteRequest<AliasState>> = {},
): ModelRouteRequest<AliasState> {
  return {
    model: fakeModel("alias", DEFINITION.id),
    thinkingLevel: "high",
    reason: "user",
    messages: [],
    ...overrides,
  };
}

describe("createAliasRoute", () => {
  it("picks the first available target", () => {
    const route = createAliasRoute(DEFINITION);
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3"],
      ],
    });

    const result = route(request(), registry);

    expect(result.model.provider).toBe("neuralwatt");
    expect(result.model.id).toBe("kimi-k3");
    expect(result.thinkingLevel).toBe("high");
    expect(result.state).toEqual({
      provider: "neuralwatt",
      modelId: "kimi-k3",
    });
  });

  it("falls through when the first target is missing or unauthed", () => {
    const route = createAliasRoute(DEFINITION);
    const registry = fakeRegistry({
      authed: ["synthetic"],
      models: [["synthetic", "hf:moonshotai/Kimi-K3"]],
    });

    const result = route(request(), registry);

    expect(result.model.provider).toBe("synthetic");
    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("keeps the sticky state across later requests", () => {
    const route = createAliasRoute(DEFINITION);
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3"],
      ],
    });
    const state: AliasState = {
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    };

    const result = route(request({ reason: "continuation", state }), registry);

    expect(result.model.provider).toBe("synthetic");
    expect(result.state).toBeUndefined();
  });

  it("re-picks and updates state when the sticky target disappears", () => {
    const route = createAliasRoute(DEFINITION);
    const registry = fakeRegistry({
      authed: ["synthetic"],
      models: [["synthetic", "hf:moonshotai/Kimi-K3"]],
    });
    const state: AliasState = { provider: "neuralwatt", modelId: "kimi-k3" };

    const result = route(request({ reason: "retry", state }), registry);

    expect(result.model.provider).toBe("synthetic");
    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("adopts the previous response model when it is an alias target", () => {
    const route = createAliasRoute(DEFINITION);
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3"],
      ],
    });

    const result = route(
      request({
        previous: {
          model: fakeModel("synthetic", "hf:moonshotai/Kimi-K3"),
          thinkingLevel: "medium",
        },
      }),
      registry,
    );

    expect(result.model.provider).toBe("synthetic");
    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("throws when no target is available", () => {
    const route = createAliasRoute(DEFINITION);
    const registry = fakeRegistry({ authed: [], models: [] });

    expect(() => route(request(), registry)).toThrow(/alias\/kimi-k3/);
  });
});
