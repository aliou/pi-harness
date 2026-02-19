/**
 * Configuration for the specialized subagents extension.
 *
 * SubagentsConfig is the user-facing schema (all fields optional).
 * ResolvedSubagentsConfig is the internal schema (all fields required, defaults applied).
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

/** Supported providers for subagents. */
export const SUPPORTED_PROVIDERS = [
  "openrouter",
  "anthropic",
  "openai-codex",
] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/** Subagent names that can be configured. */
export const SUBAGENT_NAMES = [
  "scout",
  "lookout",
  "oracle",
  "reviewer",
  "jester",
  "worker",
] as const;
export type SubagentName = (typeof SUBAGENT_NAMES)[number];

export interface SubagentModelConfig {
  provider?: SupportedProvider;
  model?: string;
  enabled?: boolean;
}

export interface SubagentsConfig {
  debug?: boolean;
  subagents?: Partial<Record<SubagentName, SubagentModelConfig>>;
}

export interface ResolvedSubagentModelConfig {
  provider: SupportedProvider;
  model: string;
  enabled: boolean;
}

export interface ResolvedSubagentsConfig {
  debug: boolean;
  subagents: Record<SubagentName, ResolvedSubagentModelConfig>;
}

const DEFAULT_CONFIG: ResolvedSubagentsConfig = {
  debug: false,
  subagents: {
    scout: {
      provider: "openrouter",
      model: "z-ai/glm-5",
      enabled: true,
    },
    lookout: {
      provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      enabled: true,
    },
    oracle: { provider: "openrouter", model: "openai/gpt-5.2", enabled: true },
    reviewer: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      enabled: true,
    },
    jester: {
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
      enabled: true,
    },
    worker: {
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
      enabled: true,
    },
  },
};

export const configLoader = new ConfigLoader<
  SubagentsConfig,
  ResolvedSubagentsConfig
>("subagents", DEFAULT_CONFIG, {
  scopes: ["global", "memory"],
});

/** Get the resolved model config for a subagent. */
export function getSubagentModelConfig(
  name: SubagentName,
): ResolvedSubagentModelConfig {
  return configLoader.getConfig().subagents[name];
}

/** Whether debug logging is enabled for subagents. */
export function isDebugEnabled(): boolean {
  return configLoader.getConfig().debug;
}

/** Whether a subagent is enabled. */
export function isSubagentEnabled(name: SubagentName): boolean {
  return configLoader.getConfig().subagents[name].enabled;
}
