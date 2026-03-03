import type { ProviderKey } from "./config";

function normalizeProviderId(providerId: string): string {
  return providerId.trim().toLowerCase();
}

export function toProviderKey(
  providerId: string | null | undefined,
): ProviderKey | null {
  if (!providerId) return null;

  const normalized = normalizeProviderId(providerId);
  if (normalized === "anthropic") return "anthropic";
  if (normalized === "openai-codex") return "openai-codex";
  if (normalized === "synthetic") return "synthetic";
  if (normalized === "zai" || normalized === "z-ai") return "zai";

  return null;
}

export function getProviderKeyFromModel(
  model: { provider: string } | undefined,
): ProviderKey | null {
  if (!model) return null;
  return toProviderKey(model.provider);
}
