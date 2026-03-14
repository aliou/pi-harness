import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Map of "provider/modelId" to the desired context window size in tokens.
 *
 * Models matching a key in this map will have their contextWindow overridden
 * via pi.registerProvider() at session start.
 */
const CONTEXT_WINDOW_OVERRIDES: Record<string, number> = {
  "anthropic/claude-opus-4-6": 200_000,
  "anthropic/claude-sonnet-4-6": 200_000,
};

function makeOverrideKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

/**
 * Apply context window overrides by re-registering affected providers with
 * modified model definitions. Only providers that have at least one overridden
 * model are re-registered.
 */
function applyOverrides(pi: ExtensionAPI, allModels: Model<Api>[]): void {
  // Group models by provider, only for providers that have overrides.
  const affectedProviders = new Map<string, Model<Api>[]>();

  for (const model of allModels) {
    const key = makeOverrideKey(model.provider, model.id);
    if (!(key in CONTEXT_WINDOW_OVERRIDES)) continue;

    if (!affectedProviders.has(model.provider)) {
      // Collect ALL models for this provider so registerProvider does not
      // drop the ones we are not overriding.
      const providerModels = allModels.filter(
        (m) => m.provider === model.provider,
      );
      affectedProviders.set(model.provider, providerModels);
    }
  }

  for (const [provider, models] of affectedProviders) {
    const overriddenModels = models.map((m) => {
      const key = makeOverrideKey(m.provider, m.id);
      return {
        ...m,
        contextWindow: CONTEXT_WINDOW_OVERRIDES[key] ?? m.contextWindow,
      };
    });

    const firstModel = models[0];
    if (!firstModel) continue;

    pi.registerProvider(provider, {
      baseUrl: firstModel.baseUrl,
      apiKey: "ANTHROPIC_API_KEY",
      api: firstModel.api,
      models: overriddenModels,
    });
  }
}

export function setupContextWindowOverrides(pi: ExtensionAPI): void {
  if (Object.keys(CONTEXT_WINDOW_OVERRIDES).length === 0) return;

  pi.on("session_start", async (_event, ctx) => {
    const allModels = ctx.modelRegistry.getAll();
    applyOverrides(pi, allModels);

    // After re-registering models in the registry, the active model object
    // still holds stale values. Re-select it from the updated registry so
    // the agent uses the overridden contextWindow.
    const current = ctx.model;
    if (current) {
      const key = makeOverrideKey(current.provider, current.id);
      if (key in CONTEXT_WINDOW_OVERRIDES) {
        const updated = ctx.modelRegistry.find(current.provider, current.id);
        if (updated) {
          await pi.setModel(updated);
        }
      }
    }
  });

  pi.on("model_select", async (event, ctx) => {
    const model = event.model;
    const key = makeOverrideKey(model.provider, model.id);
    const override = CONTEXT_WINDOW_OVERRIDES[key];

    if (override !== undefined && model.contextWindow !== override) {
      // The selected model has a stale contextWindow. Look up the
      // overridden version from the registry and re-set it.
      const updated = ctx.modelRegistry.find(model.provider, model.id);
      if (updated && updated.contextWindow === override) {
        await pi.setModel(updated);
      }
    }
  });
}
