import type { Model } from "@mariozechner/pi-ai";
import type {
  AuthStorage,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getProviderSettings, type ProviderKey } from "../config";
import { fetchClaudeRateLimits } from "../rate-limits/claude";
import { fetchCodexRateLimits } from "../rate-limits/codex";
import type { ProviderRateLimits, RateLimitWindow } from "../types";
import { formatResetTime } from "../utils";
import { forceShowWidget } from "./usage-bar";

const WARNING_THRESHOLD = 80;
const ERROR_THRESHOLD = 90;
const CRITICAL_THRESHOLD = 100;
const MIN_PACE_PERCENT = 5;
const END_WINDOW_SUPPRESS_THRESHOLD = 90;

type ClaudeModelFamily = "opus" | "sonnet" | null;

/**
 * Tracks which windows have already shown warnings this session.
 * Key format: "provider:label" (e.g., "anthropic:Daily tokens")
 */
const warnedWindows = new Set<string>();

function getWindowKey(provider: string, label: string): string {
  return `${provider}:${label}`;
}

type WindowProjection = {
  window: RateLimitWindow;
  projectedPercent: number;
};

function inferWindowSeconds(label: string): number | null {
  const lower = label.toLowerCase();
  if (lower.includes("5-hour") || lower.includes("5h")) {
    return 5 * 60 * 60;
  }
  if (
    lower.includes("7-day") ||
    lower.includes("week") ||
    lower.includes("weekly")
  ) {
    return 7 * 24 * 60 * 60;
  }
  const hourMatch = lower.match(/(\d+)\s*h/);
  if (hourMatch?.[1]) return Number(hourMatch[1]) * 60 * 60;
  const dayMatch = lower.match(/(\d+)\s*d/);
  if (dayMatch?.[1]) return Number(dayMatch[1]) * 24 * 60 * 60;
  return null;
}

/**
 * Filters Claude rate limit windows based on the current model family.
 * Always shows: 5-hour window + weekly window.
 * For Sonnet: uses Sonnet-specific weekly window.
 * For other models: uses generic weekly window.
 */
function filterClaudeWindows(
  windows: RateLimitWindow[],
  modelFamily: ClaudeModelFamily,
): RateLimitWindow[] {
  // For non-Claude models or unknown family, return all windows
  if (!modelFamily) return windows;

  let fiveHourWindow: RateLimitWindow | null = null;
  let sonnetWeekWindow: RateLimitWindow | null = null;
  let genericWeekWindow: RateLimitWindow | null = null;

  for (const window of windows) {
    const label = window.label.toLowerCase();
    const windowSeconds =
      window.windowSeconds ?? inferWindowSeconds(window.label);

    const isFiveHour =
      (windowSeconds !== null &&
        windowSeconds > 0 &&
        windowSeconds <= 6 * 60 * 60) ||
      label.includes("5-hour") ||
      label.includes("5h");
    const isWeekly =
      (windowSeconds !== null && windowSeconds >= 6 * 24 * 60 * 60) ||
      label.includes("7-day") ||
      label.includes("week") ||
      label.includes("weekly");

    if (isFiveHour) {
      fiveHourWindow = window;
      continue;
    }

    if (label.includes("sonnet") && isWeekly) {
      sonnetWeekWindow = window;
      continue;
    }

    if (
      (label.includes("all models") || label === "7-day window") &&
      isWeekly
    ) {
      genericWeekWindow = window;
    }
  }

  const filtered: RateLimitWindow[] = [];

  // Always show 5-hour window
  if (fiveHourWindow) filtered.push(fiveHourWindow);

  // Sonnet uses Sonnet-specific weekly, others use generic
  if (modelFamily === "sonnet" && sonnetWeekWindow) {
    filtered.push(sonnetWeekWindow);
  } else if (genericWeekWindow) {
    filtered.push(genericWeekWindow);
  }

  return filtered;
}

function getPacePercent(window: RateLimitWindow): number | null {
  const windowSeconds =
    window.windowSeconds ?? inferWindowSeconds(window.label);
  if (!windowSeconds || !window.resetsAt) return null;
  const totalMs = windowSeconds * 1000;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;
  const remainingMs = window.resetsAt.getTime() - Date.now();
  const elapsedMs = totalMs - remainingMs;
  const percent = (elapsedMs / totalMs) * 100;
  return Math.max(0, Math.min(100, percent));
}

function getProjectedPercent(
  usedPercent: number,
  pacePercent?: number | null,
): number {
  if (pacePercent === null || pacePercent === undefined) return usedPercent;
  const effectivePace = Math.max(MIN_PACE_PERCENT, pacePercent);
  return Math.max(0, (usedPercent / effectivePace) * 100);
}

function getProjectionStatus(
  projectedPercent: number,
): "critical" | "high" | "warning" | null {
  if (projectedPercent >= CRITICAL_THRESHOLD) return "critical";
  if (projectedPercent >= ERROR_THRESHOLD) return "high";
  if (projectedPercent >= WARNING_THRESHOLD) return "warning";
  return null;
}

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
 * Detects the Claude model family (opus/sonnet) from the model ID.
 */
function getClaudeModelFamily(
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
  model: Model<any> | undefined,
): ClaudeModelFamily {
  if (!model) return null;
  const modelId = model.id.toLowerCase();
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
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
 * Finds windows that exceed the projection threshold and haven't been warned yet.
 */
function findNewHighUsageWindows(
  limits: ProviderRateLimits,
  providerKey: ProviderKey,
  modelFamily: ClaudeModelFamily,
  skipAlreadyWarned: boolean,
): WindowProjection[] {
  if (limits.error || !limits.windows.length) return [];

  // Filter Claude windows based on model family
  const windows =
    providerKey === "anthropic"
      ? filterClaudeWindows(limits.windows, modelFamily)
      : limits.windows;

  return windows.flatMap((window) => {
    const pacePercent = getPacePercent(window);
    const projectedPercent = getProjectedPercent(
      window.usedPercent,
      pacePercent,
    );
    if (projectedPercent < WARNING_THRESHOLD) return [];
    if (
      pacePercent !== null &&
      pacePercent !== undefined &&
      pacePercent >= END_WINDOW_SUPPRESS_THRESHOLD &&
      projectedPercent < CRITICAL_THRESHOLD
    ) {
      return [];
    }
    if (skipAlreadyWarned) {
      const key = getWindowKey(limits.provider, window.label);
      if (warnedWindows.has(key)) return [];
    }
    return [{ window, projectedPercent }];
  });
}

/**
 * Marks windows as warned so they won't trigger again.
 */
function markWindowsAsWarned(
  provider: string,
  windows: WindowProjection[],
): void {
  for (const entry of windows) {
    warnedWindows.add(getWindowKey(provider, entry.window.label));
  }
}

/**
 * Formats the warning message for the notification.
 */
function formatWarningMessage(
  provider: string,
  windows: WindowProjection[],
): string {
  const lines = windows.map(({ window, projectedPercent }) => {
    const reset = formatResetTime(window.resetsAt);
    const status = getProjectionStatus(projectedPercent);
    const statusLabel = status ? ` (${status})` : "";
    return `- ${window.label}: ${Math.round(window.usedPercent)}% used, projected ${Math.round(projectedPercent)}%${statusLabel}, resets ${reset}`;
  });
  return `${provider} rate limit warning:\n${lines.join("\n")}`;
}

/**
 * Checks rate limits and shows a warning if above threshold.
 * This is fire-and-forget - does not block the caller.
 *
 * @param skipAlreadyWarned - If true, only warn for windows that haven't been warned yet.
 *                            If false, warn for all high usage windows (used on session start).
 */
async function checkAndWarnRateLimits(
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
  model: Model<any> | undefined,
  skipAlreadyWarned: boolean,
): Promise<void> {
  if (!ctx.hasUI) return;

  const providerKey = getProviderKey(model);
  if (!providerKey) return;

  // Skip if warnings are disabled for this provider
  const settings = getProviderSettings(providerKey);
  if (!settings.warnings) return;

  const authStorage = ctx.modelRegistry.authStorage;

  try {
    const limits = await fetchProviderRateLimits(providerKey, authStorage);
    if (!limits) return;

    // Verify model hasn't changed during the async check
    if (ctx.model !== model) return;

    const modelFamily = getClaudeModelFamily(model);
    const highUsageWindows = findNewHighUsageWindows(
      limits,
      providerKey,
      modelFamily,
      skipAlreadyWarned,
    );
    if (highUsageWindows.length === 0) return;

    // Mark these windows as warned before showing notification
    markWindowsAsWarned(limits.provider, highUsageWindows);

    const message = formatWarningMessage(limits.provider, highUsageWindows);

    // Determine severity based on projected usage
    const hasHighUsage = highUsageWindows.some(
      (entry) => entry.projectedPercent >= ERROR_THRESHOLD,
    );
    ctx.ui.notify(message, hasHighUsage ? "error" : "warning");

    // Force the usage bar widget visible when a warning fires
    forceShowWidget(ctx);
  } catch {
    // Silently ignore errors - this is non-blocking and should not impact the user
  }
}

/**
 * Fire-and-forget wrapper that ensures the check is non-blocking.
 *
 * @param skipAlreadyWarned - If true, only warn for windows that haven't been warned yet.
 */
function triggerRateLimitCheck(
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
  model: Model<any> | undefined,
  skipAlreadyWarned: boolean,
): void {
  // Do not await - this is intentionally fire-and-forget
  checkAndWarnRateLimits(ctx, model, skipAlreadyWarned).catch(() => {
    // Ignore errors
  });
}

export function setupRateLimitWarningHooks(pi: ExtensionAPI): void {
  // Session start: reset local warning state only. Defer checks until model
  // change or first completed agent turn.
  pi.on("session_start", async (_event, _ctx) => {
    warnedWindows.clear();
  });

  // Check after agent turn - only warn for newly crossed thresholds
  pi.on("agent_end", async (_event, ctx) => {
    triggerRateLimitCheck(ctx, ctx.model, true);
  });

  // Check when model changes - reset for new provider, show all high usage
  pi.on("model_select", async (event, ctx) => {
    // Clear warnings since we're switching providers
    warnedWindows.clear();
    triggerRateLimitCheck(ctx, event.model, false);
  });
}
