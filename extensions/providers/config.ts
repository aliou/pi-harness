/**
 * Configuration schema for the providers extension.
 *
 * ProvidersConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

// --- Types ---

export type WidgetMode = "always" | "warnings-only" | "never";

export interface ProviderOverrides {
  widget?: WidgetMode;
  warnings?: boolean;
}

export interface ProvidersConfig {
  /** Provider-specific settings */
  providers?: Record<string, ProviderOverrides>;
  refreshIntervalMinutes?: number;
}

export interface ResolvedProviderSettings {
  widget: WidgetMode;
  warnings: boolean;
}

export interface ResolvedConfig {
  providers: Record<string, ResolvedProviderSettings>;
  refreshIntervalMinutes: number;
}

// --- Provider keys (shared with hooks) ---

export type ProviderKey = "anthropic" | "openai-codex" | "synthetic" | "zai";

export const PROVIDER_KEYS: ProviderKey[] = [
  "anthropic",
  "openai-codex",
  "synthetic",
  "zai",
];

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKey, string> = {
  anthropic: "Claude Plan",
  "openai-codex": "Codex Plan",
  synthetic: "Synthetic",
  zai: "z.ai Plan",
};

// --- Defaults ---

const DEFAULT_PROVIDER_SETTINGS: ResolvedProviderSettings = {
  widget: "warnings-only",
  warnings: true,
};

const DEFAULT_CONFIG: ResolvedConfig = {
  providers: Object.fromEntries(
    PROVIDER_KEYS.map((key) => [key, { ...DEFAULT_PROVIDER_SETTINGS }]),
  ),
  refreshIntervalMinutes: 5,
};

// --- Loader ---

export const configLoader = new ConfigLoader<ProvidersConfig, ResolvedConfig>(
  "providers",
  DEFAULT_CONFIG,
  {
    scopes: ["global", "memory"],
  },
);

// --- Settings Helpers ---

/**
 * Get the resolved settings for a specific provider.
 */
export function getProviderSettings(
  providerId: string,
): ResolvedProviderSettings {
  const config = configLoader.getConfig();

  if (config.providers[providerId]) {
    return config.providers[providerId];
  }

  return DEFAULT_PROVIDER_SETTINGS;
}

/**
 * Get the display name for a provider.
 */
export function getProviderDisplayName(providerId: string): string {
  // Check if it's a known provider
  if (PROVIDER_KEYS.includes(providerId as ProviderKey)) {
    return PROVIDER_DISPLAY_NAMES[providerId as ProviderKey];
  }

  // Unknown - return the ID
  return providerId;
}
