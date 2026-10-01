import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRouteRequest } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelRoute, type RouteRegistry, type RouteState } from "./route";
import { LATEST_MODELS, PROFILES, type RoutedModelDefinition } from "./table";

function definition(id: string, pool = LATEST_MODELS): RoutedModelDefinition {
  const found = pool.find((entry) => entry.id === id);
  if (!found) throw new Error(`${id} missing from table`);
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
  definition: RoutedModelDefinition,
  overrides: Partial<ModelRouteRequest<RouteState>> = {},
): ModelRouteRequest<RouteState> {
  return {
    model: fakeModel(definition.provider, definition.id),
    thinkingLevel: "high",
    reason: "user",
    messages: [],
    ...overrides,
  };
}

const KIMI = definition("kimi");
const OPUS = definition("claude-opus");
const SOL = definition("gpt-sol");
const LARGE = definition("large", PROFILES);
const FLASH = definition("flash", PROFILES);
const SMALL = definition("small", PROFILES);

const KIMI_REGISTRY = fakeRegistry({
  authed: ["neuralwatt", "synthetic"],
  models: [
    ["synthetic", "hf:moonshotai/Kimi-K3"],
    ["neuralwatt", "kimi-k3-fast"],
    ["neuralwatt", "kimi-k2.7-code"],
    ["neuralwatt", "kimi-k3"],
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createModelRoute: cross-provider picks", () => {
  it("matches by model id on any authed provider", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = createModelRoute(KIMI)(request(KIMI), KIMI_REGISTRY);

    expect(result.model).toEqual(
      fakeModel("synthetic", "hf:moonshotai/Kimi-K3"),
    );
    expect(result.thinkingLevel).toBe("high");
    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("picks randomly among providers serving the same id", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const result = createModelRoute(KIMI)(request(KIMI), KIMI_REGISTRY);

    expect(result.model).toEqual(fakeModel("neuralwatt", "kimi-k3"));
  });

  it("ignores suffixed variants", () => {
    const registry = fakeRegistry({
      authed: ["neuralwatt"],
      models: [["neuralwatt", "kimi-k3-fast"]],
    });

    expect(() => createModelRoute(KIMI)(request(KIMI), registry)).toThrow(
      /latest\/kimi:/,
    );
  });

  it("skips providers without auth", () => {
    const registry = fakeRegistry({
      authed: ["synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3"],
      ],
    });

    const result = createModelRoute(KIMI)(request(KIMI), registry);

    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("keeps the sticky pick", () => {
    const state = { provider: "synthetic", modelId: "hf:moonshotai/Kimi-K3" };

    const result = createModelRoute(KIMI)(
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

    const result = createModelRoute(KIMI)(
      request(KIMI, { reason: "retry", state }),
      registry,
    );

    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("adopts the previous response model when it is a target", () => {
    const result = createModelRoute(KIMI)(
      request(KIMI, {
        previous: { model: fakeModel("synthetic", "hf:moonshotai/Kimi-K3") },
      }),
      KIMI_REGISTRY,
    );

    expect(result.model.provider).toBe("synthetic");
  });

  it("throws when nothing matches", () => {
    const route = createModelRoute(KIMI);

    expect(() => route(request(KIMI), fakeRegistry({}))).toThrow(
      /latest\/kimi:/,
    );
  });
});

describe("createModelRoute: latest-version resolution", () => {
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

    const result = createModelRoute(OPUS)(request(OPUS), registry);

    expect(result.model.id).toBe("claude-opus-5-5");
  });

  it("prefers a newer version regardless of provider", () => {
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["synthetic", "hf:moonshotai/Kimi-K3.5"],
      ],
    });

    const result = createModelRoute(KIMI)(request(KIMI), registry);

    expect(result.model.provider).toBe("synthetic");
  });

  it("keeps GLM and GLM Flash apart", () => {
    const glm = definition("glm");
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "glm-5.4-flash"],
        ["neuralwatt", "glm-5.3-flex"],
        ["neuralwatt", "glm-5.3"],
        ["synthetic", "hf:zai-org/GLM-5.4-Flash"],
      ],
    });

    const result = createModelRoute(glm)(request(glm), registry);

    expect(result.model.id).toBe("glm-5.3");
  });

  it("matches both Qwen id spellings", () => {
    const qwen = definition("qwen-27b");
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "qwen3.6-35b"],
        ["neuralwatt", "qwen-3.8-27b"],
        ["synthetic", "hf:Qwen/Qwen3.9-27B"],
      ],
    });

    const result = createModelRoute(qwen)(request(qwen), registry);

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

    const result = createModelRoute(SOL)(request(SOL), registry);

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

    const result = createModelRoute(SOL)(
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

    const result = createModelRoute(SOL)(
      request(SOL, { reason: "continuation", state }),
      registry,
    );

    expect(result.model.id).toBe("gpt-6-sol");
  });
});

describe("createModelRoute: profiles", () => {
  it("large routes to kimi-k3", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = createModelRoute(LARGE)(request(LARGE), KIMI_REGISTRY);

    expect(result.state).toEqual({
      provider: "synthetic",
      modelId: "hf:moonshotai/Kimi-K3",
    });
  });

  it("stays pinned when a newer version appears", () => {
    const registry = fakeRegistry({
      authed: ["neuralwatt"],
      models: [
        ["neuralwatt", "kimi-k3"],
        ["neuralwatt", "kimi-k3.5"],
      ],
    });

    const result = createModelRoute(LARGE)(request(LARGE), registry);

    expect(result.model).toEqual(fakeModel("neuralwatt", "kimi-k3"));
  });

  it("flash routes to deepseek-v4.1-flash, not v4 or glm", () => {
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "glm-5.3-flash"],
        ["neuralwatt", "deepseek-v4.1-flash"],
        ["neuralwatt", "deepseek-v4-flash"],
      ],
    });

    const result = createModelRoute(FLASH)(request(FLASH), registry);

    expect(result.model).toEqual(
      fakeModel("neuralwatt", "deepseek-v4.1-flash"),
    );
  });

  it("small routes to Qwen 3.8 27B, not the 35B", () => {
    const registry = fakeRegistry({
      authed: ["neuralwatt", "synthetic"],
      models: [
        ["neuralwatt", "qwen3.6-35b"],
        ["neuralwatt", "qwen-3.8-27b"],
        ["synthetic", "hf:Qwen/Qwen3.8-27B"],
      ],
    });

    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = createModelRoute(SMALL)(request(SMALL), registry);

    expect(result.model).toEqual(fakeModel("neuralwatt", "qwen-3.8-27b"));
  });

  it("throws naming the profile provider when nothing matches", () => {
    const route = createModelRoute(FLASH);

    expect(() => route(request(FLASH), fakeRegistry({}))).toThrow(
      /profile\/flash:/,
    );
  });
});
