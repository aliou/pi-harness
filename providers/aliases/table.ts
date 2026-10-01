/**
 * Alias table. Each alias is a pattern over model ids, resolved against the
 * live model registry when the router picks a model. Nothing here lists
 * concrete versions: a model that appears in the registry (for example once
 * Aperture serves it) and matches a pattern becomes a candidate on the next
 * pick.
 *
 * Patterns run against the normalized id (`normalizeModelId`): lowercased,
 * without any `org/` or `hf:org/` prefix, so `hf:moonshotai/Kimi-K3` on
 * synthetic and `kimi-k3` on neuralwatt both read `kimi-k3`. Anchor every
 * pattern so suffixed variants (`-flash`, `-flex`, `-fast`, dated snapshots)
 * only match when the pattern names them.
 *
 * The first capture group, when present, is the version. The router picks the
 * highest version, then the first provider in `providers` that serves it.
 */
export interface AliasDefinition {
  /** Model id under the `alias` provider, e.g. `kimi-k3` for `alias/kimi-k3`. */
  id: string;
  /** Display name in /model. */
  name: string;
  /** Providers to search, in preference order for equal versions. */
  providers: string[];
  /** Matches normalized model ids. Capture group 1 is the version. */
  match: RegExp;
}

export const ALIAS_PROVIDER = "alias";

/** Lowercase and drop any `org/` (or `hf:org/`) prefix. */
export function normalizeModelId(modelId: string): string {
  return modelId.slice(modelId.lastIndexOf("/") + 1).toLowerCase();
}

// Neuralwatt comes first for the larger context windows.
const OPEN_WEIGHTS = ["neuralwatt", "synthetic"];

export const ALIASES: AliasDefinition[] = [
  {
    id: "kimi",
    name: "Kimi (latest)",
    providers: OPEN_WEIGHTS,
    // kimi-k3; not kimi-k2.7-code
    match: /^kimi-k(\d+(?:\.\d+)?)$/,
  },
  {
    id: "glm",
    name: "GLM (latest)",
    providers: OPEN_WEIGHTS,
    // glm-5.3; not glm-5.3-flash or glm-5.3-flex
    match: /^glm-(\d+(?:\.\d+)?)$/,
  },
  {
    id: "glm-flash",
    name: "GLM Flash (latest)",
    providers: OPEN_WEIGHTS,
    // glm-5.3-flash; not glm-5.3
    match: /^glm-(\d+(?:\.\d+)?)-flash$/,
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek Flash (latest)",
    providers: OPEN_WEIGHTS,
    match: /^deepseek-v(\d+(?:\.\d+)?)-flash$/,
  },
  {
    id: "qwen-27b",
    name: "Qwen 27B (latest)",
    providers: OPEN_WEIGHTS,
    // neuralwatt: qwen-3.8-27b, synthetic: qwen3.8-27b
    match: /^qwen-?(\d+(?:\.\d+)?)-27b$/,
  },
  {
    id: "claude-opus",
    name: "Claude Opus (latest)",
    providers: ["anthropic"],
    // claude-opus-5, claude-opus-5-5; not dated snapshots like claude-opus-4-5-20251101
    match: /^claude-opus-(\d+(?:-\d+)?)$/,
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet (latest)",
    providers: ["anthropic"],
    match: /^claude-sonnet-(\d+(?:-\d+)?)$/,
  },
  {
    id: "claude-fable",
    name: "Claude Fable (latest)",
    providers: ["anthropic"],
    match: /^claude-fable-(\d+(?:-\d+)?)$/,
  },
  {
    id: "gpt-sol",
    name: "GPT Sol (latest)",
    providers: ["openai"],
    match: /^gpt-(\d+(?:\.\d+)?)-sol$/,
  },
  {
    id: "gpt-luna",
    name: "GPT Luna (latest)",
    providers: ["openai"],
    match: /^gpt-(\d+(?:\.\d+)?)-luna$/,
  },
  {
    id: "gpt-astra",
    name: "GPT Astra (latest)",
    providers: ["openai"],
    match: /^gpt-(\d+(?:\.\d+)?)-astra$/,
  },
];
