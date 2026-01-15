import type { Model } from "@mariozechner/pi-ai";
import type {
  AuthStorage,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { fetchClaudeRateLimits } from "../providers/claude";
import { fetchCodexRateLimits } from "../providers/codex";
import type { ProviderRateLimits, RateLimitWindow } from "../types";
import { formatResetTime } from "../utils";

const WARNING_THRESHOLD = 60;

type ProviderKey = "anthropic" | "openai-codex";

/**
 * Maps a model provider to the rate limit provider key.
 */
// biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
function getProviderKey(model: Model<any> | undefined): ProviderKey | null {
  if (!model) return null;
  const provider = model.provider.toLowerCase();
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai-codex") return "openai-codex";
  return null;
}

/**
 * Fetches rate limits for a specific provider.
 */
async function fetchProviderRateLimits(
  providerKey: ProviderKey,
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits | null> {
  switch (providerKey) {
    case "anthropic":
      return fetchClaudeRateLimits(authStorage, signal);
    case "openai-codex":
      return fetchCodexRateLimits(authStorage, signal);
    default:
      return null;
  }
}

/**
 * Finds windows that exceed the warning threshold.
 */
function findHighUsageWindows(limits: ProviderRateLimits): RateLimitWindow[] {
  if (limits.error || !limits.windows.length) return [];
  return limits.windows.filter(
    (window) => window.usedPercent >= WARNING_THRESHOLD,
  );
}

/**
 * Formats the warning message for the notification.
 */
function formatWarningMessage(
  provider: string,
  windows: RateLimitWindow[],
): string {
  const lines = windows.map((w) => {
    const reset = formatResetTime(w.resetsAt);
    return `- ${w.label}: ${Math.round(w.usedPercent)}%, resets ${reset}`;
  });
  return `${provider} rate limit warning:\n${lines.join("\n")}`;
}

/**
 * Checks rate limits and shows a warning if above threshold.
 * This is fire-and-forget - does not block the caller.
 */
async function checkAndWarnRateLimits(
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
  model: Model<any> | undefined,
): Promise<void> {
  if (!ctx.hasUI) return;

  const providerKey = getProviderKey(model);
  if (!providerKey) return;

  const authStorage = ctx.modelRegistry.authStorage;

  try {
    const limits = await fetchProviderRateLimits(providerKey, authStorage);
    if (!limits) return;

    const highUsageWindows = findHighUsageWindows(limits);
    if (highUsageWindows.length === 0) return;

    const message = formatWarningMessage(limits.provider, highUsageWindows);

    // Determine severity: error if any window is >= 80%, warning otherwise
    const hasHighUsage = highUsageWindows.some((w) => w.usedPercent >= 80);
    ctx.ui.notify(message, hasHighUsage ? "error" : "warning");
  } catch {
    // Silently ignore errors - this is non-blocking and should not impact the user
  }
}

/**
 * Fire-and-forget wrapper that ensures the check is non-blocking.
 */
function triggerRateLimitCheck(
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
  model: Model<any> | undefined,
): void {
  // Do not await - this is intentionally fire-and-forget
  checkAndWarnRateLimits(ctx, model).catch(() => {
    // Ignore errors
  });
}

export function setupRateLimitWarningHooks(pi: ExtensionAPI): void {
  // Check on session start (when pi starts or new session)
  pi.on("session_start", async (_event, ctx) => {
    triggerRateLimitCheck(ctx, ctx.model);
  });

  // Check after agent turn completes (when streaming is done)
  pi.on("agent_end", async (_event, ctx) => {
    triggerRateLimitCheck(ctx, ctx.model);
  });

  // Check when model changes
  pi.on("model_select", async (event, ctx) => {
    triggerRateLimitCheck(ctx, event.model);
  });
}
