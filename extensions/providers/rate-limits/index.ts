import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type { ProviderRateLimits } from "../types";
import { fetchClaudeRateLimits } from "./claude";
import { fetchCodexRateLimits } from "./codex";
import { fetchSyntheticRateLimits } from "./synthetic";
import { fetchZaiRateLimits } from "./zai";

export async function fetchAllProviderRateLimits(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits[]> {
  const [claude, codex, synthetic, zai] = await Promise.all([
    fetchClaudeRateLimits(authStorage, signal),
    fetchCodexRateLimits(authStorage, signal),
    fetchSyntheticRateLimits(signal),
    fetchZaiRateLimits(signal),
  ]);

  return [claude, codex, synthetic, zai];
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
