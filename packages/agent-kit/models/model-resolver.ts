import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { providerCooldown } from "./cooldown";
import type {
  SubagentModelChoice,
  SubagentModelPreference,
  SubagentModelRanking,
  SubagentResolvedModel,
  SubagentSkippedModel,
} from "./types";

export interface RankModelsOptions {
  /**
   * Temporary eligibility filter for providers that recently failed. Applied
   * as a second pass: cooled providers are dropped only while at least one
   * non-cooled candidate survives. Defaults to the process-wide cooldown map;
   * pass `() => false` to ignore cooldowns.
   */
  isCooled?: (provider: string) => boolean;
}

/**
 * Rank a subagent's model roster into the order attempts should be made in.
 *
 * Entries the registry does not know about, or that have no configured auth,
 * are reported as skipped. Roster order is attempt order.
 */
export function rankModels(
  registry: ModelRegistry,
  preferences: readonly SubagentModelPreference[],
  options: RankModelsOptions = {},
): SubagentModelRanking {
  const isCooled =
    options.isCooled ??
    ((provider: string) => providerCooldown.isCooled(provider));
  const skipped: SubagentSkippedModel[] = [];
  const usable: SubagentModelPreference[] = [];

  for (const preference of preferences) {
    const reason = usabilityReason(registry, preference);
    if (reason) {
      skipped.push({ preference: recordFor(preference), reason });
      continue;
    }
    usable.push(preference);
  }

  const eligible = applyCooldown(usable, isCooled, skipped);
  const candidates: SubagentModelChoice[] = [];

  for (const preference of eligible) {
    const model = registry.find(preference.provider, preference.model);
    if (!model) continue;
    candidates.push({
      model,
      thinking: preference.thinking,
      preference: recordFor(preference),
      skipped,
    });
  }

  return { candidates, skipped };
}

/**
 * Pick a model for a fresh subagent run: the first entry of the ranking.
 *
 * Prefer {@link rankModels} when the caller can fail over; this exists for
 * single-shot call sites.
 */
export function pickModel(
  registry: ModelRegistry,
  preferences: readonly SubagentModelPreference[],
  options: RankModelsOptions = {},
): SubagentModelChoice | null {
  return rankModels(registry, preferences, options).candidates[0] ?? null;
}

/**
 * Resolve the model for a resumed subagent run. Prefers the pinned model from
 * the session record when it is still authed — cooldowns do not apply to a pin,
 * because a resumed session cannot move to another model without losing its
 * history. Falls back to {@link pickModel} when the pin is unusable.
 */
export function resolveModel(
  registry: ModelRegistry,
  preferences: readonly SubagentModelPreference[],
  pinned?: SubagentResolvedModel,
): SubagentModelChoice | null {
  if (pinned && !usabilityReason(registry, { ...pinned })) {
    const model = registry.find(pinned.provider, pinned.model);
    if (model) {
      return {
        model,
        thinking: pinned.thinking,
        preference: pinned,
        skipped: [],
      };
    }
  }

  return pickModel(registry, preferences);
}

function applyCooldown(
  usable: SubagentModelPreference[],
  isCooled: (provider: string) => boolean,
  skipped: SubagentSkippedModel[],
): SubagentModelPreference[] {
  const hot = usable.filter((entry) => !isCooled(entry.provider));
  // Every usable candidate is cooled: ignore cooldowns entirely rather than
  // failing the run. One probe is better than no subagent.
  if (hot.length === 0) return usable;

  for (const entry of usable) {
    if (isCooled(entry.provider)) {
      skipped.push({ preference: recordFor(entry), reason: "recently-failed" });
    }
  }
  return hot;
}

function usabilityReason(
  registry: ModelRegistry,
  preference: SubagentModelPreference,
): string | null {
  const model = registry.find(preference.provider, preference.model);
  if (!model) return "unknown-model";
  if (!registry.hasConfiguredAuth(model)) return "unauthed";
  return null;
}

function recordFor(preference: SubagentModelPreference): SubagentResolvedModel {
  return {
    provider: preference.provider,
    model: preference.model,
    thinking: preference.thinking,
  };
}
