/**
 * Multi-credential account management for providers extension.
 *
 * Accounts are named provider configurations that reuse the same rate limit
 * pool as their base provider. Each account has its own credentials in auth storage.
 */

import type { ProviderKey } from "./config";

export interface ProviderAccount {
  /** Unique ID for this account (e.g., "openai-codex-work") */
  id: string;

  /** Base provider this account belongs to */
  baseProvider: ProviderKey;

  /** Display name shown in /login and UI (e.g., "Codex (Work)") */
  displayName: string;

  /** Optional description */
  description?: string;
}

/**
 * Base providers that support multi-credential accounts.
 * Only openai-codex currently supports this feature.
 */
export const ACCOUNT_PROVIDERS: ProviderKey[] = ["openai-codex"];

/**
 * Check if a provider ID is an account (contains hyphen after base provider name)
 */
export function isAccountProviderId(providerId: string): boolean {
  return ACCOUNT_PROVIDERS.some(
    (base) => providerId.startsWith(`${base}-`) && providerId !== base,
  );
}

/**
 * Get the base provider from a provider ID.
 * For base providers, returns the input.
 * For accounts, extracts the base from the ID.
 */
export function getBaseProvider(providerId: string): ProviderKey | null {
  // Check if it's an account pattern first
  for (const base of ACCOUNT_PROVIDERS) {
    if (providerId.startsWith(`${base}-`) && providerId !== base) {
      return base;
    }
  }
  return null;
}

/**
 * Generate a display name for an account based on its ID and base provider
 */
export function generateDisplayName(
  baseProvider: ProviderKey,
  accountId: string,
): string {
  const prefix = `${baseProvider}-`;
  const name = accountId.startsWith(prefix)
    ? accountId.slice(prefix.length)
    : accountId;

  const baseDisplay = baseProvider === "openai-codex" ? "Codex" : baseProvider;

  return `${baseDisplay} (${name})`;
}

/**
 * Validate account ID format
 */
export function validateAccountId(
  accountId: string,
  baseProvider: ProviderKey,
): { valid: boolean; error?: string } {
  const prefix = `${baseProvider}-`;

  if (!accountId.startsWith(prefix)) {
    return {
      valid: false,
      error: `Account ID must start with "${prefix}"`,
    };
  }

  const name = accountId.slice(prefix.length);

  if (name.length < 3) {
    return {
      valid: false,
      error: "Account name must be at least 3 characters",
    };
  }

  if (name.length > 30) {
    return {
      valid: false,
      error: "Account name must be at most 30 characters",
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return {
      valid: false,
      error:
        "Account name must contain only letters, numbers, hyphens, and underscores",
    };
  }

  return { valid: true };
}

/**
 * Default accounts configuration (empty by default)
 */
export const DEFAULT_ACCOUNTS: ProviderAccount[] = [];
