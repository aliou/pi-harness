import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";

const CODEX_FAST_ENTRY_TYPE = "providers-codex-fast";
const FAST_SYMBOL = "\u26A1 ";

function isCodexFastEnabled(ctx: ExtensionContext): boolean {
  const entries = ctx.sessionManager.getEntries();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom") continue;
    if (entry.customType !== CODEX_FAST_ENTRY_TYPE) continue;

    const data = entry.data as { enabled?: boolean } | undefined;
    return data?.enabled === true;
  }

  return false;
}

/**
 * Build model line for footer line 2 right side
 */
export function buildModelLine(
  theme: Theme,
  ctx: ExtensionContext,
  provider: string | undefined,
  modelId: string | undefined,
  hasReasoning: boolean,
  thinkingLevel: string,
): string {
  const fastPrefix =
    provider === "openai-codex" && isCodexFastEnabled(ctx) ? FAST_SYMBOL : "";
  const providerName = `${fastPrefix}${provider ?? "unknown"}`;
  let modelLine = `${providerName}/${modelId ?? "no-model"}`;

  if (hasReasoning && thinkingLevel !== "off") {
    const formattedLevel = thinkingLevel.slice(0, 3); // min, med, max
    modelLine = `${providerName}/${modelId} (${formattedLevel})`;
  }

  return theme.fg("thinkingMinimal", modelLine);
}

/**
 * Build model ID only (no provider, no thinking level)
 */
export function buildModelIdLine(
  theme: Theme,
  modelId: string | undefined,
  ctx?: ExtensionContext,
  provider?: string | undefined,
): string {
  const fastPrefix =
    ctx && provider === "openai-codex" && isCodexFastEnabled(ctx)
      ? FAST_SYMBOL
      : "";
  return theme.fg("thinkingMinimal", `${fastPrefix}${modelId ?? "no-model"}`);
}
