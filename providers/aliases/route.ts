import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  ModelRoute,
  ModelRouteRequest,
} from "@earendil-works/pi-coding-agent";
import { type AliasDefinition, normalizeModelId } from "./table";

/** Sticky pick stored on the session branch by Pi's virtual model runtime. */
export interface AliasState {
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
  /** Index in `definition.providers`; lower is preferred. */
  rank: number;
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
  definition: AliasDefinition,
  model: Model<Api>,
): Candidate | undefined {
  const rank = definition.providers.indexOf(model.provider);
  if (rank < 0) return undefined;
  const match = definition.match.exec(normalizeModelId(model.id));
  if (!match) return undefined;
  return { model, rank, version: parseVersion(match[1]) };
}

/**
 * Models in the live registry that match the alias and have auth, best first:
 * highest version, then provider preference.
 */
export function rankCandidates(
  definition: AliasDefinition,
  registry: RouteRegistry,
): Candidate[] {
  return registry
    .getAll()
    .filter((model) => registry.hasConfiguredAuth(model))
    .map((model) => toCandidate(definition, model))
    .filter((candidate) => candidate !== undefined)
    .sort((a, b) => compareVersions(b.version, a.version) || a.rank - b.rank);
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
): ModelRoute<AliasState> {
  return {
    model,
    thinkingLevel,
    state: { provider: model.provider, modelId: model.id },
  };
}

/**
 * Build the route function for one alias. Uniform across route reasons: the
 * sticky pick wins while it still matches and stays available, which keeps
 * retries on the failed provider and preserves the prompt cache. A newer
 * version therefore reaches new sessions, not ones already pinned.
 */
export function createAliasRoute(definition: AliasDefinition) {
  return (
    request: ModelRouteRequest<AliasState>,
    registry: RouteRegistry,
  ): ModelRoute<AliasState> => {
    const candidates = rankCandidates(definition, registry);
    const best = candidates[0];
    if (!best) {
      throw new Error(
        `alias/${definition.id}: no available model matches ${definition.match} on ${definition.providers.join(", ")}`,
      );
    }

    const sticky = candidates.find((c) => isModel(c.model, request.state));
    if (sticky)
      return { model: sticky.model, thinkingLevel: request.thinkingLevel };

    // Switching to the alias mid-session keeps the current response model when
    // it is the latest version on another preferred provider, so the switch
    // costs no cache miss. An older version is not adopted.
    const adopted = candidates.find(
      (c) =>
        isModel(c.model, request.previous?.model) &&
        compareVersions(c.version, best.version) === 0,
    );
    return toRoute((adopted ?? best).model, request.thinkingLevel);
  };
}
