import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type { ProviderKey } from "../config";
import type { ProviderRateLimits } from "../types";
import { fetchClaudeRateLimits } from "./claude";
import { fetchCodexRateLimits } from "./codex";
import { fetchSyntheticRateLimits } from "./synthetic";
import { fetchZaiRateLimits } from "./zai";

export async function fetchProviderRateLimits(
  providerKey: ProviderKey,
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits | null> {
  switch (providerKey) {
    case "anthropic":
      return fetchClaudeRateLimits(authStorage, signal);
    case "openai-codex":
      return fetchCodexRateLimits(authStorage, signal);
    case "synthetic":
      return fetchSyntheticRateLimits(signal);
    case "zai":
      return fetchZaiRateLimits(signal);
    default:
      return null;
  }
}
