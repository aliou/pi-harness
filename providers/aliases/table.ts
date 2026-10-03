/**
 * Virtual model tables. Each entry becomes a selectable virtual model that
 * routes to a concrete model in the live registry. Everything here is based
 * on the model id itself: no real provider names appear anywhere. A candidate
 * is any model whose normalized id matches the pattern on any provider with
 * configured auth.
 *
 * Two providers ship, deliberately unsynced:
 *
 * - `latest` names a model family (`latest/kimi`, `latest/claude-opus`,
 *   `latest/gpt-sol`, ...) and resolves to the newest version of it via a
 *   version-capture pattern. Fully dynamic: a new version in the registry
 *   wins on the next pick.
 * - `profile` names a task shape (`profile/large`, `profile/flash`,
 *   `profile/small`) and is pinned to one exact model id per entry. Bumping
 *   a profile to a newer version is a manual edit, typically after trying
 *   the `latest` equivalent for a while.
 *
 * Patterns run against the normalized id (`normalizeModelId`): lowercased,
 * without any `org/` or `hf:org/` prefix, so `hf:moonshotai/Kimi-K3` on one
 * provider and `kimi-k3` on another both read `kimi-k3`. Anchor every
 * pattern so suffixed variants (`-flash`, `-flex`, `-fast`, dated snapshots)
 * only match when the pattern names them.
 *
 * For `latest`, the first capture group is the version and the router picks
 * the highest version. Candidates tied on version are picked at random. To
 * pin a provider, select the concrete model on that provider instead of the
 * alias.
 *
 * Consumer contract (relied on by pi-rig's `@rig/models` and provider-gated
 * hooks):
 *
 * - Virtuality is the only safe discriminator: alias selections carry
 *   `api: "pi-virtual"`. The listing provider (`latest`, `profile`, or a
 *   forced physical provider name such as `openai`) is a namespace and
 *   never identifies the routed provider. Consumers must resolve through
 *   the sticky route state before any provider or id check.
 * - Alias ids are stable family names (`claude-opus`, `gpt-sol`, `kimi`,
 *   ...) regardless of the listing provider: forcing the provider changes
 *   the namespace, never the id. `profile` ids name task shapes and imply
 *   nothing about the routed family.
 * - Fast-capability is a family property: `claude-opus` and `gpt-*` aliases
 *   only route to fast-capable families, so consumers may open fast mode on
 *   the selection alone. Whether fast actually applies is still decided per
 *   request from the routed model and its auth.
 * - The sticky route state (`{ provider, modelId }` on
 *   `pi.virtual-model-state` entries) is the canonical handoff to
 *   consumers; the latest matching entry on the branch wins.
 */
export interface RoutedModelDefinition {
  /** Virtual provider the model lives under (`latest`, `profile`). */
  provider: string;
  /** Model id under that provider, e.g. `kimi` for `latest/kimi`. */
  id: string;
  /** Display name in /model. */
  name: string;
  /**
   * Matches normalized model ids. For `latest`, capture group 1 is the
   * version. Profiles match one exact id and have no capture group.
   */
  match: RegExp;
}

export const LATEST_PROVIDER = "latest";
export const PROFILE_PROVIDER = "profile";

/** Lowercase and drop any `org/` (or `hf:org/`) prefix. */
export function normalizeModelId(modelId: string): string {
  return modelId.slice(modelId.lastIndexOf("/") + 1).toLowerCase();
}

export const LATEST_MODELS: RoutedModelDefinition[] = [
  {
    provider: LATEST_PROVIDER,
    id: "kimi",
    name: "Kimi (latest)",
    // kimi-k3; not kimi-k2.7-code
    match: /^kimi-k(\d+(?:\.\d+)?)$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "glm",
    name: "GLM (latest)",
    // glm-5.3; not glm-5.3-flash or glm-5.3-flex
    match: /^glm-(\d+(?:\.\d+)?)$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "glm-flash",
    name: "GLM Flash (latest)",
    // glm-5.3-flash; not glm-5.3
    match: /^glm-(\d+(?:\.\d+)?)-flash$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "deepseek-flash",
    name: "DeepSeek Flash (latest)",
    match: /^deepseek-v(\d+(?:\.\d+)?)-flash$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "qwen-27b",
    name: "Qwen 27B (latest)",
    // matches qwen-3.8-27b and qwen3.8-27b spellings
    match: /^qwen-?(\d+(?:\.\d+)?)-27b$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "claude-opus",
    name: "Claude Opus (latest)",
    // claude-opus-5, claude-opus-5-5; not dated snapshots like claude-opus-4-5-20251101
    match: /^claude-opus-(\d+(?:-\d+)?)$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "claude-sonnet",
    name: "Claude Sonnet (latest)",
    match: /^claude-sonnet-(\d+(?:-\d+)?)$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "claude-fable",
    name: "Claude Fable (latest)",
    match: /^claude-fable-(\d+(?:-\d+)?)$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "gpt-sol",
    name: "GPT Sol (latest)",
    match: /^gpt-(\d+(?:\.\d+)?)-sol$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "gpt-luna",
    name: "GPT Luna (latest)",
    match: /^gpt-(\d+(?:\.\d+)?)-luna$/,
  },
  {
    provider: LATEST_PROVIDER,
    id: "gpt-astra",
    name: "GPT Astra (latest)",
    match: /^gpt-(\d+(?:\.\d+)?)-astra$/,
  },
];

// Profiles pin exact model ids on purpose: bumping is a manual edit, usually
// after evaluating the `latest` equivalent. They can lag `latest` by design.
export const PROFILES: RoutedModelDefinition[] = [
  {
    provider: PROFILE_PROVIDER,
    id: "large",
    name: "Large (Kimi K3)",
    match: /^kimi-k3$/,
  },
  {
    provider: PROFILE_PROVIDER,
    id: "flash",
    name: "Flash (DeepSeek V4.1)",
    match: /^deepseek-v4\.1-flash$/,
  },
  {
    provider: PROFILE_PROVIDER,
    id: "small",
    name: "Small (Qwen 3.8 27B)",
    // matches qwen-3.8-27b and qwen3.8-27b spellings
    match: /^qwen-?3\.8-27b$/,
  },
];

export const VIRTUAL_MODELS: RoutedModelDefinition[] = [
  ...LATEST_MODELS,
  ...PROFILES,
];
