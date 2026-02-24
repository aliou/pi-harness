/**
 * Configuration schema for the providers extension.
 *
 * ProvidersConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";
import type { ProviderAccount } from "./multi-credential";
import { getBaseProvider, isAccountProviderId } from "./multi-credential";

// --- Types ---

export type WidgetMode = "always" | "warnings-only" | "never";

export interface ProviderOverrides {
  widget?: WidgetMode;
  warnings?: boolean;
}

export interface ProvidersConfig {
  /** Multi-credential accounts */
  accounts?: ProviderAccount[];
  /** Provider-specific settings (includes accounts) */
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

// --- Account Helpers ---

/**
 * Get all configured accounts.
 * Accounts are stored in global scope to persist across reloads.
 */
export function getAccounts(): ProviderAccount[] {
  const globalConfig = configLoader.getRawConfig("global");
  const config = globalConfig ?? {};
  return config.accounts ?? [];
}

/**
 * Save accounts to global config.
 * Accounts must persist across reloads.
 */
export async function saveAccounts(accounts: ProviderAccount[]): Promise<void> {
  const globalConfig = configLoader.getRawConfig("global") ?? {};
  globalConfig.accounts = accounts;
  await configLoader.save("global", globalConfig);
}

/**
 * Find an account by ID.
 */
export function findAccount(id: string): ProviderAccount | undefined {
  return getAccounts().find((a) => a.id === id);
}

/**
 * Get all accounts for a specific base provider.
 */
export function getAccountsForProvider(
  provider: ProviderKey,
): ProviderAccount[] {
  return getAccounts().filter((a) => a.baseProvider === provider);
}

/**
 * Check if a provider ID refers to an account.
 */
export { isAccountProviderId, getBaseProvider };

// --- Settings Helpers ---

/**
 * Get the resolved settings for a specific provider or account.
 * Accounts do NOT inherit widget setting from base provider (they always show).
 */
export function getProviderSettings(
  providerId: string,
): ResolvedProviderSettings {
  const config = configLoader.getConfig();

  // Check for direct settings on this provider/account
  if (config.providers[providerId]) {
    return config.providers[providerId];
  }

  // For accounts, use defaults (don't inherit widget: never from base)
  if (isAccountProviderId(providerId)) {
    return DEFAULT_PROVIDER_SETTINGS;
  }

  // For base providers, check their settings
  const baseProvider = getBaseProvider(providerId);
  if (baseProvider && config.providers[baseProvider]) {
    return config.providers[baseProvider];
  }

  return DEFAULT_PROVIDER_SETTINGS;
}

/**
 * Get the display name for a provider or account.
 */
export function getProviderDisplayName(providerId: string): string {
  // Check if it's an account
  const account = findAccount(providerId);
  if (account) {
    return account.displayName;
  }

  // Check if it's a base provider
  if (PROVIDER_KEYS.includes(providerId as ProviderKey)) {
    return PROVIDER_DISPLAY_NAMES[providerId as ProviderKey];
  }

  // Unknown - return the ID
  return providerId;
}
