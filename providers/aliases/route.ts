import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  ModelRoute,
  ModelRouteRequest,
} from "@earendil-works/pi-coding-agent";
import { normalizeModelId, type RoutedModelDefinition } from "./table";

/** Sticky pick stored on the session branch by Pi's virtual model runtime. */
export interface RouteState {
  provider: string;
  modelId: string;
}

/** The subset of the model registry the router reads. */
export interface RouteRegistry {
  getAll(): Model<Api>[];
  hasConfiguredAuth(model: Model<Api>): boolean;
}

interface Candidate {
  model: Model<Api>;
  version: number[];
}

function parseVersion(captured: string | undefined): number[] {
  return captured ? captured.split(/[.-]/).map(Number) : [];
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function toCandidate(
  definition: RoutedModelDefinition,
  model: Model<Api>,
): Candidate | undefined {
  const match = definition.match.exec(normalizeModelId(model.id));
  if (!match) return undefined;
  return { model, version: parseVersion(match[1]) };
}

/**
 * Models in the live registry whose normalized id matches the definition and
 * whose provider has configured auth, best first: highest version only.
 * Candidates tied on version keep registry order; the caller picks among
 * them at random.
 */
export function rankCandidates(
  definition: RoutedModelDefinition,
  registry: RouteRegistry,
): Candidate[] {
  return registry
    .getAll()
    .filter((model) => registry.hasConfiguredAuth(model))
    .map((model) => toCandidate(definition, model))
    .filter((candidate) => candidate !== undefined)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Pick at random among candidates tied on the best version. */
function pickCandidate(candidates: Candidate[]): Candidate {
  const best = candidates[0];
  if (!best) throw new Error("pickCandidate: no candidates");
  const tied = candidates.filter(
    (c) => compareVersions(c.version, best.version) === 0,
  );
  const picked = tied[Math.floor(Math.random() * tied.length)];
  if (!picked) throw new Error("pickCandidate: empty tie group");
  return picked;
}

function isModel(
  model: Model<Api>,
  ref: { provider: string; id?: string; modelId?: string } | undefined,
): boolean {
  return (
    ref !== undefined &&
    model.provider === ref.provider &&
    model.id === (ref.id ?? ref.modelId)
  );
}

function toRoute(
  model: Model<Api>,
  thinkingLevel: ModelThinkingLevel,
): ModelRoute<RouteState> {
  return {
    model,
    thinkingLevel,
    state: { provider: model.provider, modelId: model.id },
  };
}

/**
 * Build the route function for one virtual model. Uniform across route
 * reasons: the sticky pick wins while it still matches and stays available,
 * which keeps retries on the failed provider and preserves the prompt cache.
 * A newer version therefore reaches new sessions, not ones already pinned.
 * A fresh pick is random among providers tied on the best version.
 */
export function createModelRoute(definition: RoutedModelDefinition) {
  return (
    request: ModelRouteRequest<RouteState>,
    registry: RouteRegistry,
  ): ModelRoute<RouteState> => {
    const candidates = rankCandidates(definition, registry);
    const best = candidates[0];
    if (!best) {
      throw new Error(
        `${definition.provider}/${definition.id}: no available model matches ${definition.match} on any provider with configured auth`,
      );
    }

    const sticky = candidates.find((c) => isModel(c.model, request.state));
    if (sticky)
      return { model: sticky.model, thinkingLevel: request.thinkingLevel };

    // Switching to the virtual model mid-session keeps the current response
    // model when it ties the best version, so the switch costs no cache
    // miss. An older version is not adopted.
    const adopted = candidates.find(
      (c) =>
        isModel(c.model, request.previous?.model) &&
        compareVersions(c.version, best.version) === 0,
    );
    return toRoute(
      (adopted ?? pickCandidate(candidates)).model,
      request.thinkingLevel,
    );
  };
}
