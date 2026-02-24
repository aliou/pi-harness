import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import { getAccounts } from "../config";
import type { ProviderRateLimits } from "../types";
import { fetchClaudeRateLimits } from "./claude";
import { fetchCodexRateLimits } from "./codex";
import { fetchSyntheticRateLimits } from "./synthetic";
import { fetchZaiRateLimits } from "./zai";

export async function fetchAllProviderRateLimits(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits[]> {
  // Fetch base providers
  const [claude, codex, synthetic, zai] = await Promise.all([
    fetchClaudeRateLimits(authStorage, signal),
    fetchCodexRateLimits(authStorage, signal),
    fetchSyntheticRateLimits(signal),
    fetchZaiRateLimits(signal),
  ]);

  // Fetch accounts - only openai-codex supports accounts
  const accounts = getAccounts();
  const accountLimits: ProviderRateLimits[] = [];

  for (const account of accounts) {
    if (account.baseProvider !== "openai-codex") continue;

    const limits = await fetchCodexRateLimits(authStorage, signal, account.id);
    accountLimits.push({
      ...limits,
      provider: account.displayName,
      providerId: account.id,
      accountId: account.id,
    });
  }

  return [claude, codex, synthetic, zai, ...accountLimits];
}

export type {
  RiskAssessment,
  RiskSeverity,
  WindowProjection,
} from "./projection";
// Export projection/risk assessment utilities
export {
  assessWindowRisk,
  getPacePercent,
  getProjectedPercent,
  getSeverityColor,
  inferWindowSeconds,
} from "./projection";
