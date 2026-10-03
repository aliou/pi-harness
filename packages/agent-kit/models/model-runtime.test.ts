import type { Api, Model } from "@earendil-works/pi-ai";
import {
  CredentialSynchronizationError,
  type ModelRegistry,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createSubagentModelRuntime } from "./model-runtime";

describe("createSubagentModelRuntime", () => {
  it("inherits each available physical provider once for a virtual selection", async () => {
    const providers = [{ id: "synthetic" }, { id: "aperture" }];
    const registry = {
      getAvailable: vi.fn(() => [
        { provider: "synthetic", id: "one", api: "openai-completions" },
        { provider: "synthetic", id: "two", api: "openai-completions" },
        {
          provider: "aperture",
          id: "synthetic/one",
          api: "openai-completions",
        },
        { provider: "anthropic", id: "claude", api: "anthropic-messages" },
        { provider: "agents", id: "scout", api: "pi-virtual" },
      ]),
      getRegisteredNativeProvider: vi.fn((id) =>
        providers.find((provider) => provider.id === id),
      ),
      getApiKeyForProvider: vi.fn(async (id) =>
        id === "anthropic" ? "oauth" : "placeholder",
      ),
      isUsingOAuth: vi.fn((model) => model.provider === "anthropic"),
    } as unknown as ModelRegistry;
    const runtime = {
      registerNativeProvider: vi.fn(),
      setRuntimeApiKey: vi.fn(async () => undefined),
    } as unknown as ModelRuntime;

    await createSubagentModelRuntime(
      registry,
      { provider: "agents", id: "scout", api: "pi-virtual" } as Model<Api>,
      async () => runtime,
    );

    expect(runtime.registerNativeProvider).toHaveBeenCalledTimes(2);
    expect(runtime.registerNativeProvider).toHaveBeenCalledWith(providers[0]);
    expect(runtime.registerNativeProvider).toHaveBeenCalledWith(providers[1]);
    expect(registry.getApiKeyForProvider).toHaveBeenCalledTimes(3);
    expect(registry.getApiKeyForProvider).not.toHaveBeenCalledWith("agents");
    expect(runtime.setRuntimeApiKey).toHaveBeenCalledTimes(2);
    expect(runtime.setRuntimeApiKey).not.toHaveBeenCalledWith(
      "anthropic",
      "oauth",
    );
  });

  it("copies the parent's native provider registration and resolved API key", async () => {
    const nativeProvider = { id: "synthetic" };
    const registry = {
      getRegisteredNativeProvider: vi.fn(() => nativeProvider),
      getApiKeyForProvider: vi.fn(async () => "secret"),
      isUsingOAuth: vi.fn(() => false),
    } as unknown as ModelRegistry;
    const runtime = {
      registerNativeProvider: vi.fn(),
      setRuntimeApiKey: vi.fn(async () => undefined),
    } as unknown as ModelRuntime;

    await createSubagentModelRuntime(
      registry,
      { provider: "synthetic", id: "model" } as Model<Api>,
      async () => runtime,
    );

    expect(runtime.registerNativeProvider).toHaveBeenCalledWith(nativeProvider);
    expect(runtime.setRuntimeApiKey).toHaveBeenCalledWith(
      "synthetic",
      "secret",
    );
  });

  it("keeps runtime defaults when the parent has no native provider or key", async () => {
    const registry = {
      getRegisteredNativeProvider: vi.fn(() => undefined),
      getApiKeyForProvider: vi.fn(async () => undefined),
      isUsingOAuth: vi.fn(() => false),
    } as unknown as ModelRegistry;
    const runtime = {
      registerNativeProvider: vi.fn(),
      setRuntimeApiKey: vi.fn(async () => undefined),
    } as unknown as ModelRuntime;

    await createSubagentModelRuntime(
      registry,
      { provider: "anthropic", id: "model" } as Model<Api>,
      async () => runtime,
    );

    expect(runtime.registerNativeProvider).not.toHaveBeenCalled();
    expect(runtime.setRuntimeApiKey).not.toHaveBeenCalled();
  });

  it("preserves OAuth credentials for OAuth-backed providers", async () => {
    const registry = {
      getRegisteredNativeProvider: vi.fn(() => undefined),
      getApiKeyForProvider: vi.fn(async () => "oauth-access-token"),
      isUsingOAuth: vi.fn(() => true),
    } as unknown as ModelRegistry;
    const runtime = {
      registerNativeProvider: vi.fn(),
      setRuntimeApiKey: vi.fn(async () => undefined),
    } as unknown as ModelRuntime;

    await createSubagentModelRuntime(
      registry,
      { provider: "anthropic", id: "model" } as Model<Api>,
      async () => runtime,
    );

    expect(runtime.setRuntimeApiKey).not.toHaveBeenCalled();
  });

  it("tolerates a committed credential whose local sync failed", async () => {
    const registry = {
      getRegisteredNativeProvider: vi.fn(() => undefined),
      getApiKeyForProvider: vi.fn(async () => "secret"),
      isUsingOAuth: vi.fn(() => false),
    } as unknown as ModelRegistry;
    const runtime = {
      registerNativeProvider: vi.fn(),
      setRuntimeApiKey: vi.fn(async () => {
        throw new CredentialSynchronizationError(
          "neuralwatt",
          "setRuntimeApiKey",
          { type: "api_key", key: "secret" },
          { cause: new Error("refresh failed") },
        );
      }),
    } as unknown as ModelRuntime;

    const result = await createSubagentModelRuntime(
      registry,
      { provider: "neuralwatt", id: "model" } as Model<Api>,
      async () => runtime,
    );

    expect(result).toBe(runtime);
    expect(runtime.setRuntimeApiKey).toHaveBeenCalledWith(
      "neuralwatt",
      "secret",
    );
  });

  it("rethrows other setRuntimeApiKey failures", async () => {
    const registry = {
      getRegisteredNativeProvider: vi.fn(() => undefined),
      getApiKeyForProvider: vi.fn(async () => "secret"),
      isUsingOAuth: vi.fn(() => false),
    } as unknown as ModelRegistry;
    const runtime = {
      registerNativeProvider: vi.fn(),
      setRuntimeApiKey: vi.fn(async () => {
        throw new Error("boom");
      }),
    } as unknown as ModelRuntime;

    await expect(
      createSubagentModelRuntime(
        registry,
        { provider: "custom", id: "model" } as Model<Api>,
        async () => runtime,
      ),
    ).rejects.toThrow("boom");
  });
});
