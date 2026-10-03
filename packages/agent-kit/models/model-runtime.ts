import type { Api, Model } from "@earendil-works/pi-ai";
import {
  CredentialSynchronizationError,
  type ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { isVirtualModel } from "@harness/models";

type CreateModelRuntime = typeof ModelRuntime.create;

/**
 * Physical selections inherit one provider; virtual selections inherit the
 * parent's available physical providers. Routes load through the child loader.
 */
export async function createSubagentModelRuntime(
  registry: ModelRegistry,
  model: Model<Api>,
  createRuntime: CreateModelRuntime = ModelRuntime.create,
): Promise<ModelRuntime> {
  const runtime = await createRuntime();
  const models = isVirtualModel(model)
    ? registry.getAvailable().filter((candidate) => !isVirtualModel(candidate))
    : [model];
  const providers = new Map(
    models.map((candidate) => [candidate.provider, candidate]),
  );
  for (const candidate of providers.values()) {
    await inheritProvider(runtime, registry, candidate);
  }
  return runtime;
}

async function inheritProvider(
  runtime: ModelRuntime,
  registry: ModelRegistry,
  model: Model<Api>,
): Promise<void> {
  // All first-party providers register natively (pi.registerProvider(provider)
  // routes to registerNativeProvider), so copying the native registration is
  // the single inheritance path. It also carries aperture-wrapped providers
  // (gateway baseUrls, placeholder apiKey resolve) as-is.
  const nativeProvider = registry.getRegisteredNativeProvider(model.provider);
  if (nativeProvider) {
    runtime.registerNativeProvider(nativeProvider);
  }

  const apiKey = await registry.getApiKeyForProvider(model.provider);
  if (apiKey && !registry.isUsingOAuth(model)) {
    try {
      await runtime.setRuntimeApiKey(model.provider, apiKey);
    } catch (error) {
      // The credential is committed to the runtime's overlay even when this
      // throws; only the opportunistic local catalog refresh failed (e.g. a
      // provider extension's refreshModels callback erroring). Treat it as
      // non-fatal so a stale or broken provider catalog refresh cannot take
      // down subagent creation, matching Pi's own login/logout handling.
      if (!(error instanceof CredentialSynchronizationError)) throw error;
    }
  }
}
