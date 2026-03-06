/**
 * Configuration for the specialized subagents extension.
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

/** Supported providers for subagents. */
export const SUPPORTED_PROVIDERS = [
  "openrouter",
  "anthropic",
  "openai-codex",
  "mistral",
  "synthetic",
  "zai",
] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface SubagentModelCandidate {
  provider: SupportedProvider;
  model: string;
}

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

export const SCOUT_WEB_SEARCH_PROVIDERS = [
  "exa",
  "linkup",
  "synthetic",
] as const;
export const SCOUT_WEB_FETCH_PROVIDERS = [
  "exa",
  "linkup",
  "markdownDotNew",
] as const;

export type ScoutWebSearchProvider =
  (typeof SCOUT_WEB_SEARCH_PROVIDERS)[number];
export type ScoutWebFetchProvider = (typeof SCOUT_WEB_FETCH_PROVIDERS)[number];

export interface ScoutWebConfig {
  searchOrder?: ScoutWebSearchProvider[];
  fetchOrder?: ScoutWebFetchProvider[];
  providers?: {
    exa?: {
      enabled?: boolean;
      searchMode?: "auto" | "fast" | "deep" | "instant";
    };
    linkup?: {
      enabled?: boolean;
      searchDepth?: "standard" | "deep" | "fast";
      renderJsDefault?: boolean;
    };
    synthetic?: { enabled?: boolean };
    markdownDotNew?: { enabled?: boolean };
  };
}

export interface ResolvedScoutWebConfig {
  searchOrder: ScoutWebSearchProvider[];
  fetchOrder: ScoutWebFetchProvider[];
  providers: {
    exa: { enabled: boolean; searchMode: "auto" | "fast" | "deep" | "instant" };
    linkup: {
      enabled: boolean;
      searchDepth: "standard" | "deep" | "fast";
      renderJsDefault: boolean;
    };
    synthetic: { enabled: boolean };
    markdownDotNew: { enabled: boolean };
  };
}

export interface SubagentModelConfig {
  candidates?: SubagentModelCandidate[];
  enabled?: boolean;
  web?: ScoutWebConfig;
}

export interface SubagentsConfig {
  debug?: boolean;
  subagents?: Partial<Record<SubagentName, SubagentModelConfig>>;
}

export interface ResolvedSubagentModelConfig {
  candidates: SubagentModelCandidate[];
  enabled: boolean;
  web?: ResolvedScoutWebConfig;
}

export interface ResolvedSubagentsConfig {
  debug: boolean;
  subagents: Record<SubagentName, ResolvedSubagentModelConfig>;
}

const DEFAULT_SCOUT_WEB_CONFIG: ResolvedScoutWebConfig = {
  searchOrder: ["synthetic", "exa", "linkup"],
  fetchOrder: ["markdownDotNew", "exa", "linkup"],
  providers: {
    exa: { enabled: true, searchMode: "auto" },
    linkup: { enabled: true, searchDepth: "fast", renderJsDefault: false },
    synthetic: { enabled: true },
    markdownDotNew: { enabled: true },
  },
};

const DEFAULT_CONFIG: ResolvedSubagentsConfig = {
  debug: false,
  subagents: {
    scout: {
      candidates: [
        { provider: "openrouter", model: "google/gemini-2.5-flash-lite" },
        { provider: "synthetic", model: "hf:zai-org/GLM-4.7-Flash" },
        { provider: "zai", model: "glm-4.7-flash" },
        { provider: "mistral", model: "ministral-8b-2512" },
      ],
      enabled: true,
      web: DEFAULT_SCOUT_WEB_CONFIG,
    },
    lookout: {
      candidates: [
        { provider: "openrouter", model: "google/gemini-2.5-flash-lite" },
        { provider: "synthetic", model: "hf:zai-org/GLM-4.7-Flash" },
        { provider: "zai", model: "glm-4.7-flash" },
        { provider: "mistral", model: "ministral-8b-2512" },
      ],
      enabled: true,
    },
    oracle: {
      candidates: [
        { provider: "openai-codex", model: "gpt-5.3-codex" },
        { provider: "mistral", model: "magistral-medium-2509" },
      ],
      enabled: true,
    },
    reviewer: {
      candidates: [
        { provider: "anthropic", model: "claude-sonnet-4-6" },
        { provider: "mistral", model: "mistral-large-2512" },
      ],
      enabled: true,
    },
    jester: {
      candidates: [
        { provider: "zai", model: "glm-4.5-air" },
        { provider: "mistral", model: "ministral-3b-2512" },
      ],
      enabled: true,
    },
    worker: {
      candidates: [
        { provider: "anthropic", model: "claude-sonnet-4-6" },
        { provider: "synthetic", model: "hf:MiniMaxAI/MiniMax-M2.5" },
        { provider: "mistral", model: "devstral-2512" },
        { provider: "zai", model: "glm-4.7" },
      ],
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
  const resolved = configLoader.getConfig().subagents[name];
  if (resolved.candidates && resolved.candidates.length > 0) return resolved;
  return {
    ...resolved,
    candidates: DEFAULT_CONFIG.subagents[name].candidates,
  };
}

/** Whether debug logging is enabled for subagents. */
export function isDebugEnabled(): boolean {
  return configLoader.getConfig().debug;
}

/** Whether a subagent is enabled. */
export function isSubagentEnabled(name: SubagentName): boolean {
  return configLoader.getConfig().subagents[name].enabled;
}

function normalizeSearchOrder(
  order: ScoutWebSearchProvider[] | undefined,
): ScoutWebSearchProvider[] {
  const valid = new Set(SCOUT_WEB_SEARCH_PROVIDERS);
  const filtered = (order ?? []).filter((p): p is ScoutWebSearchProvider =>
    valid.has(p),
  );
  const deduped = [...new Set(filtered)];
  for (const provider of DEFAULT_SCOUT_WEB_CONFIG.searchOrder) {
    if (!deduped.includes(provider)) deduped.push(provider);
  }
  return deduped;
}

function normalizeFetchOrder(
  order: ScoutWebFetchProvider[] | undefined,
): ScoutWebFetchProvider[] {
  const valid = new Set(SCOUT_WEB_FETCH_PROVIDERS);
  const filtered = (order ?? []).filter((p): p is ScoutWebFetchProvider =>
    valid.has(p),
  );
  const deduped = [...new Set(filtered)];
  for (const provider of DEFAULT_SCOUT_WEB_CONFIG.fetchOrder) {
    if (!deduped.includes(provider)) deduped.push(provider);
  }
  return deduped;
}

export function getScoutWebConfig(): ResolvedScoutWebConfig {
  const config = configLoader.getConfig();
  const web = config.subagents.scout.web;

  return {
    searchOrder: normalizeSearchOrder(web?.searchOrder),
    fetchOrder: normalizeFetchOrder(web?.fetchOrder),
    providers: {
      exa: {
        enabled:
          web?.providers?.exa?.enabled ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.exa.enabled,
        searchMode:
          web?.providers?.exa?.searchMode ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.exa.searchMode,
      },
      linkup: {
        enabled:
          web?.providers?.linkup?.enabled ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.linkup.enabled,
        searchDepth:
          web?.providers?.linkup?.searchDepth ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.linkup.searchDepth,
        renderJsDefault:
          web?.providers?.linkup?.renderJsDefault ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.linkup.renderJsDefault,
      },
      synthetic: {
        enabled:
          web?.providers?.synthetic?.enabled ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.synthetic.enabled,
      },
      markdownDotNew: {
        enabled:
          web?.providers?.markdownDotNew?.enabled ??
          DEFAULT_SCOUT_WEB_CONFIG.providers.markdownDotNew.enabled,
      },
    },
  };
}
