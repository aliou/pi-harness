import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type { ProviderRateLimits } from "../types";
import { fetchClaudeRateLimits } from "./claude";
import { fetchCodexRateLimits } from "./codex";

export async function fetchAllProviderRateLimits(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits[]> {
  const [claude, codex] = await Promise.all([
    fetchClaudeRateLimits(authStorage, signal),
    fetchCodexRateLimits(authStorage, signal),
  ]);
  return [claude, codex];
}
