import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRouteRequest } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { type AliasState, createAliasRoute, type RouteRegistry } from "./route";
import { ALIASES, type AliasDefinition } from "./table";

function alias(id: string): AliasDefinition {
  const found = ALIASES.find((definition) => definition.id === id);
  if (!found) throw new Error(`${id} alias missing from table`);
  return found;
}

function fakeModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

function fakeRegistry(options: {
  authed?: string[];
  models?: [string, string][];
}): RouteRegistry {
  const authed = new Set(options.authed ?? []);
  const models = (options.models ?? []).map(([provider, id]) =>
    fakeModel(provider, id),
  );
  return {
    getAll: () => models,
    hasConfiguredAuth: (model) => authed.has(model.provider),
  };
}

function request(
  definition: AliasDefinition,
  overrides: Partial<ModelRouteRequest<AliasState>> = {},
): ModelRouteRequest<AliasState> {
  return {
    model: fakeModel("alias", definition.id),
    thinkingLevel: "high",
    reason: "user",
    messages: [],
    ...overrides,
  };
}

const KIMI = alias("kimi");
const OPUS = alias("claude-opus");
const SOL = alias("gpt-sol");

const KIMI_REGISTRY = fakeRegistry({
  authed: ["neuralwatt", "synthetic"],
  models: [
    ["synthetic", "hf:moonshotai/Kimi-K3"],
    ["neuralwatt", "kimi-k3-fast"],
    ["neuralwatt", "kimi-k2.7-code"],
    ["neuralwatt", "kimi-k3"],
  ],
});

describe("createAliasRoute: cross-provider aliases", () => {
  it("picks the first preferred provider and ignores suffixed variants", () => {
    const result = createAliasRoute(KIMI)(request(KIMI), KIMI_REGISTRY);

    expect(result.model).toEqual(fakeModel("neuralwatt", "kimi-k3"));
    expect(result.thinkingLevel).toBe("high");
    expect(result.state).toEqual({
      provider: "neuralwatt",
      modelId: "kimi-k3",
    });
  });

  it("matches prefixed ids and skips providers without auth", () => {
    const registry = fakeRegistry({
      authed: ["synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3"],
      ],
    });

    const result = createAliasRoute(KIMI)(request(KIMI), registry);

    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("keeps the sticky pick", () => {
    const state = { provider: "synthetic", modelId: "hf:moonshotai/Kimi-K3" };

    const result = createAliasRoute(KIMI)(
      request(KIMI, { reason: "continuation", state }),
      KIMI_REGISTRY,
    );

    expect(result.model.provider).toBe("synthetic");
    expect(result.state).toBeUndefined();
  });

  it("re-picks when the sticky pick disappears", () => {
    const registry = fakeRegistry({
      authed: ["synthetic"],
      models: [["synthetic", "hf:moonshotai/Kimi-K3"]],
    });
    const state = { provider: "neuralwatt", modelId: "kimi-k3" };

    const result = createAliasRoute(KIMI)(
      request(KIMI, { reason: "retry", state }),
      registry,
    );

    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("adopts the previous response model when it is a target", () => {
    const result = createAliasRoute(KIMI)(
      request(KIMI, {
        previous: { model: fakeModel("synthetic", "hf:moonshotai/Kimi-K3") },
      }),
      KIMI_REGISTRY,
    );

    expect(result.model.provider).toBe("synthetic");
  });

  it("throws when nothing matches", () => {
    const route = createAliasRoute(KIMI);

    expect(() => route(request(KIMI), fakeRegistry({}))).toThrow(
      /alias\/kimi:/,
    );
  });
});

describe("createAliasRoute: latest-version aliases", () => {
  it("picks the highest version present in the registry", () => {
    const registry = fakeRegistry({
      authed: ["anthropic"],
      models: [
        ["anthropic", "claude-opus-4-8"],
        ["anthropic", "claude-opus-5-5"],
        ["anthropic", "claude-opus-5"],
        ["anthropic", "claude-opus-4-5-20251101"],
        ["anthropic", "claude-sonnet-6"],
      ],
    });

    const result = createAliasRoute(OPUS)(request(OPUS), registry);

    expect(result.model.id).toBe("claude-opus-5-5");
  });

  it("prefers a newer version over provider order", () => {
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3.5"],
      ],
    });

    const result = createAliasRoute(KIMI)(request(KIMI), registry);

    expect(result.model.provider).toBe("synthetic");
  });

  it("keeps GLM and GLM Flash apart", () => {
    const glm = alias("glm");
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "glm-5.4-flash"],
        ["neuralwatt", "glm-5.3-flex"],
        ["neuralwatt", "glm-5.3"],
        ["synthetic", "hf:zai-org/GLM-5.4-Flash"],
      ],
    });

    const result = createAliasRoute(glm)(request(glm), registry);

    expect(result.model.id).toBe("glm-5.3");
  });

  it("matches both Qwen id spellings", () => {
    const qwen = alias("qwen-27b");
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "qwen3.6-35b"],
        ["neuralwatt", "qwen-3.8-27b"],
        ["synthetic", "hf:Qwen/Qwen3.9-27B"],
      ],
    });

    const result = createAliasRoute(qwen)(request(qwen), registry);

    expect(result.model.id).toBe("hf:Qwen/Qwen3.9-27B");
  });

  it("orders dotted versions numerically", () => {
    const registry = fakeRegistry({
      authed: ["openai"],
      models: [
        ["openai", "gpt-5.6-sol"],
        ["openai", "gpt-6.1-sol"],
        ["openai", "gpt-6-sol"],
        ["openai", "gpt-6-luna"],
      ],
    });

    const result = createAliasRoute(SOL)(request(SOL), registry);

    expect(result.model.id).toBe("gpt-6.1-sol");
  });

  it("does not adopt an older previous version", () => {
    const registry = fakeRegistry({
      authed: ["openai"],
      models: [
        ["openai", "gpt-6-sol"],
        ["openai", "gpt-6.1-sol"],
      ],
    });

    const result = createAliasRoute(SOL)(
      request(SOL, { previous: { model: fakeModel("openai", "gpt-6-sol") } }),
      registry,
    );

    expect(result.model.id).toBe("gpt-6.1-sol");
  });

  it("keeps a sticky older version after a newer one appears", () => {
    const registry = fakeRegistry({
      authed: ["openai"],
      models: [
        ["openai", "gpt-6-sol"],
        ["openai", "gpt-6.1-sol"],
      ],
    });
    const state = { provider: "openai", modelId: "gpt-6-sol" };

    const result = createAliasRoute(SOL)(
      request(SOL, { reason: "continuation", state }),
      registry,
    );

    expect(result.model.id).toBe("gpt-6-sol");
  });
});
