/**
 * Hardcoded alias table. Each alias lists its physical targets in preference
 * order. Neuralwatt comes first for the larger context windows; its
 * flex/fast/speed variants are intentionally excluded.
 *
 * Later this can be generated from the model registry: group models by
 * normalized id across providers and order groups by provider weights.
 */
export interface AliasTarget {
  provider: string;
  modelId: string;
}

export interface AliasDefinition {
  /** Model id under the `alias` provider, e.g. `kimi-k3` for `alias/kimi-k3`. */
  id: string;
  /** Display name in /model. */
  name: string;
  /** Targets in preference order; the first available one wins. */
  targets: AliasTarget[];
  /** Limits of the first target, shown until the first response. */
  contextWindow: number;
  maxTokens: number;
}

export const ALIAS_PROVIDER = "alias";

export const ALIASES: AliasDefinition[] = [
  {
    id: "kimi-k3",
    name: "Kimi K3",
    targets: [
      { provider: "neuralwatt", modelId: "kimi-k3" },
      { provider: "synthetic", modelId: "hf:moonshotai/Kimi-K3" },
    ],
    contextWindow: 1_000_000,
    maxTokens: 1_000_000,
  },
  {
    id: "glm-5.3-flash",
    name: "GLM 5.3 Flash",
    targets: [
      { provider: "neuralwatt", modelId: "glm-5.3-flash" },
      { provider: "synthetic", modelId: "hf:zai-org/GLM-5.3-Flash" },
    ],
    contextWindow: 1_000_000,
    maxTokens: 1_000_000,
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    targets: [
      { provider: "neuralwatt", modelId: "deepseek-v4.1-flash" },
      { provider: "synthetic", modelId: "hf:deepseek-ai/DeepSeek-V4.1-Flash" },
    ],
    contextWindow: 1_000_000,
    maxTokens: 393_200,
  },
  {
    id: "qwen-3.8-27b",
    name: "Qwen 3.8 27B",
    targets: [
      { provider: "neuralwatt", modelId: "qwen-3.8-27b" },
      { provider: "synthetic", modelId: "hf:Qwen/Qwen3.8-27B" },
    ],
    contextWindow: 262_100,
    maxTokens: 131_100,
  },
];
