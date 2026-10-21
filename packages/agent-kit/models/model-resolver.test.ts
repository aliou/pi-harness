import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { ProviderCooldown } from "./cooldown";
import { pickModel, rankModels, resolveModel } from "./model-resolver";
import type { SubagentModelPreference, SubagentResolvedModel } from "./types";

const noCooldown = { isCooled: () => false };

function mockRegistry(opts: {
  authed: Set<string>;
  known: Set<string>;
}): ModelRegistry {
  const known = opts.known;
  const authed = opts.authed;
  const model = (provider: string, model: string) =>
    ({ id: model, provider }) as never;
  return {
    find: (provider: string, modelId: string) =>
      known.has(`${provider}/${modelId}`)
        ? model(provider, modelId)
        : undefined,
    hasConfiguredAuth: (m: { provider: string; id: string }) =>
      authed.has(`${m.provider}/${m.id}`),
  } as unknown as ModelRegistry;
}

const PREFS: SubagentModelPreference[] = [
  { provider: "neuralwatt", model: "a", thinking: "medium" },
  { provider: "neuralwatt", model: "b", thinking: "medium" },
  { provider: "neuralwatt", model: "c", thinking: "medium" },
];

describe("pickModel", () => {
  it("returns null when no preferences are authed", () => {
    const registry = mockRegistry({
      authed: new Set(),
      known: new Set(["neuralwatt/a"]),
    });
    expect(pickModel(registry, PREFS)).toBeNull();
  });

  it("skips unknown and unauthed models, reports them, and picks the first authed", () => {
    const registry = mockRegistry({
      known: new Set(["neuralwatt/a", "neuralwatt/b"]),
      authed: new Set(["neuralwatt/a", "neuralwatt/b"]),
    });
    const prefs: SubagentModelPreference[] = [
      { provider: "neuralwatt", model: "missing", thinking: "medium" },
      { provider: "neuralwatt", model: "a", thinking: "medium" },
      { provider: "neuralwatt", model: "b", thinking: "medium" },
    ];
    const choice = pickModel(registry, prefs);
    expect(choice).not.toBeNull();
    if (!choice) return;
    expect(choice.preference.model).toBe("a");
    expect(choice.skipped.map((s) => s.reason)).toEqual(["unknown-model"]);
    expect(choice.skipped.map((s) => s.preference.model)).toEqual(["missing"]);
  });

  it("takes roster order, independent of the draw", () => {
    const registry = mockRegistry({
      known: new Set(["neuralwatt/a", "neuralwatt/b"]),
      authed: new Set(["neuralwatt/a", "neuralwatt/b"]),
    });
    expect(pickModel(registry, PREFS)?.preference.model).toBe("a");
  });
});

describe("resolveModel", () => {
  it("prefers the pinned model when still authed", () => {
    const registry = mockRegistry({
      known: new Set(["neuralwatt/a", "neuralwatt/b"]),
      authed: new Set(["neuralwatt/a", "neuralwatt/b"]),
    });
    const pinned: SubagentResolvedModel = {
      provider: "neuralwatt",
      model: "b",
      thinking: "medium",
    };
    expect(resolveModel(registry, PREFS, pinned)?.preference.model).toBe("b");
  });

  it("falls back to pickModel when the pinned model is no longer authed", () => {
    const registry = mockRegistry({
      known: new Set(["neuralwatt/a", "neuralwatt/b"]),
      authed: new Set(["neuralwatt/a"]),
    });
    const pinned: SubagentResolvedModel = {
      provider: "neuralwatt",
      model: "b",
      thinking: "medium",
    };
    expect(resolveModel(registry, PREFS, pinned)?.preference.model).toBe("a");
  });
});

describe("rankModels", () => {
  const ROSTER: SubagentModelPreference[] = [
    { provider: "neuralwatt", model: "gemma", thinking: "off" },
    { provider: "synthetic", model: "flash", thinking: "off" },
    { provider: "zai", model: "turbo", thinking: "off" },
    { provider: "openrouter", model: "gemma-it", thinking: "off" },
  ];
  const allKnown = () =>
    mockRegistry({
      known: new Set([
        "neuralwatt/gemma",
        "synthetic/flash",
        "zai/turbo",
        "openrouter/gemma-it",
      ]),
      authed: new Set([
        "neuralwatt/gemma",
        "synthetic/flash",
        "zai/turbo",
        "openrouter/gemma-it",
      ]),
    });

  it("returns the whole usable roster in attempt order", () => {
    const ranking = rankModels(allKnown(), ROSTER, noCooldown);
    expect(ranking.candidates).toHaveLength(4);
    expect(ranking.candidates.map((c) => c.preference.provider)).toEqual([
      "neuralwatt",
      "synthetic",
      "zai",
      "openrouter",
    ]);
  });

  it("excludes cooled providers while a hot candidate remains", () => {
    const cooldown = new ProviderCooldown();
    cooldown.record("neuralwatt");
    const ranking = rankModels(allKnown(), ROSTER, {
      isCooled: (provider) => cooldown.isCooled(provider),
    });
    expect(ranking.candidates.map((c) => c.preference.provider)).not.toContain(
      "neuralwatt",
    );
    expect(ranking.skipped).toContainEqual({
      preference: { provider: "neuralwatt", model: "gemma", thinking: "off" },
      reason: "recently-failed",
    });
  });

  it("ignores cooldowns when every usable candidate is cooled", () => {
    const ranking = rankModels(allKnown(), ROSTER, { isCooled: () => true });
    expect(ranking.candidates).toHaveLength(4);
    expect(ranking.skipped).toEqual([]);
  });

  it("reports unusable entries and keeps the rest ranked", () => {
    const registry = mockRegistry({
      known: new Set(["synthetic/flash", "zai/turbo"]),
      authed: new Set(["synthetic/flash"]),
    });
    const ranking = rankModels(registry, ROSTER, noCooldown);
    expect(ranking.candidates.map((c) => c.preference.provider)).toEqual([
      "synthetic",
    ]);
    expect(ranking.skipped.map((s) => s.reason).sort()).toEqual([
      "unauthed",
      "unknown-model",
      "unknown-model",
    ]);
  });

  it("returns no candidates when nothing in the roster is usable", () => {
    const registry = mockRegistry({ known: new Set(), authed: new Set() });
    expect(rankModels(registry, ROSTER, noCooldown).candidates).toEqual([]);
  });
});
