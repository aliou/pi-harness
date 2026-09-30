import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  ModelRoute,
  ModelRouteRequest,
} from "@earendil-works/pi-coding-agent";
import type { AliasDefinition, AliasTarget } from "./table";

/** Sticky pick stored on the session branch by Pi's virtual model runtime. */
export interface AliasState {
  provider: string;
  modelId: string;
}

/** The subset of the model registry the router reads. */
export interface RouteRegistry {
  find(provider: string, modelId: string): Model<Api> | undefined;
  hasConfiguredAuth(model: Model<Api>): boolean;
}

function resolve(
  target: AliasTarget,
  registry: RouteRegistry,
): Model<Api> | undefined {
  const model = registry.find(target.provider, target.modelId);
  if (!model || !registry.hasConfiguredAuth(model)) return undefined;
  return model;
}

function toRoute(
  model: Model<Api>,
  thinkingLevel: ModelThinkingLevel,
  target: AliasTarget,
): ModelRoute<AliasState> {
  return {
    model,
    thinkingLevel,
    state: { provider: target.provider, modelId: target.modelId },
  };
}

/**
 * Build the route function for one alias. Uniform across route reasons: the
 * sticky pick always wins, which keeps retries on the failed provider and
 * preserves the prompt cache.
 */
export function createAliasRoute(definition: AliasDefinition) {
  return (
    request: ModelRouteRequest<AliasState>,
    registry: RouteRegistry,
  ): ModelRoute<AliasState> => {
    const state = request.state;
    if (state) {
      const model = resolve(state, registry);
      if (model) return { model, thinkingLevel: request.thinkingLevel };
    }

    // Switching to the alias mid-session keeps the current response model when
    // it is one of the alias's targets, so the switch costs no cache miss.
    const previous = request.previous?.model;
    const adopted = definition.targets.find(
      (target) =>
        previous &&
        target.provider === previous.provider &&
        target.modelId === previous.id,
    );
    if (adopted) {
      const model = resolve(adopted, registry);
      if (model) return toRoute(model, request.thinkingLevel, adopted);
    }

    for (const target of definition.targets) {
      const model = resolve(target, registry);
      if (model) return toRoute(model, request.thinkingLevel, target);
    }

    const candidates = definition.targets
      .map((target) => `${target.provider}/${target.modelId}`)
      .join(", ");
    throw new Error(
      `alias/${definition.id}: no target available (candidates: ${candidates})`,
    );
  };
}
