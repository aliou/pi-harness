import type { Model } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getProviderSettings, type ProviderKey } from "../config";
import { getProviderKeyFromModel } from "../provider-registry";
import { fetchProviderRateLimits } from "../rate-limits/fetch-provider";
import { assessWindowRisk, type RiskSeverity } from "../rate-limits/projection";
import type { ProviderRateLimits, RateLimitWindow } from "../types";
import { formatResetTime } from "../utils";
import { forceShowWidget } from "./usage-bar";

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

type ClaudeModelFamily = "opus" | "sonnet" | null;

interface WindowAlertState {
  lastSeverity: RiskSeverity;
  lastNotifiedAt: number; // epoch ms
}

// Key format: "provider:label" (e.g., "anthropic:Daily tokens")
const windowAlerts = new Map<string, WindowAlertState>();

function getWindowKey(provider: string, label: string): string {
  return `${provider}:${label}`;
}

interface WindowRisk {
  window: RateLimitWindow;
  risk: ReturnType<typeof assessWindowRisk>;
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
 * Finds windows that exceed the risk threshold.
 * Returns windows with their risk assessments.
 */
function findHighRiskWindows(
  limits: ProviderRateLimits,
  providerKey: ProviderKey,
  modelFamily: ClaudeModelFamily,
): WindowRisk[] {
  if (limits.error || !limits.windows.length) return [];

  // Filter Claude windows based on model family
  const windows =
    providerKey === "anthropic"
      ? filterClaudeWindows(limits.windows, modelFamily)
      : limits.windows;

  return windows
    .map((window) => ({ window, risk: assessWindowRisk(window) }))
    .filter((item) => item.risk.severity !== "none");
}

/**
 * Determines if we should notify for this window based on cooldown and severity rules.
 * Rules:
 * - First time seeing this window at risk: notify
 * - Severity escalation (warning → high → critical): notify
 * - Cooldown elapsed (60 min) AND severity is "warning": notify
 * - High/Critical severity: always notify (no cooldown)
 */
function shouldNotify(windowKey: string, severity: RiskSeverity): boolean {
  const state = windowAlerts.get(windowKey);

  if (!state) {
    // First time seeing this window at risk
    return true;
  }

  // Severity escalation always notifies
  const severityOrder: RiskSeverity[] = ["none", "warning", "high", "critical"];
  const currentIndex = severityOrder.indexOf(severity);
  const lastIndex = severityOrder.indexOf(state.lastSeverity);
  if (currentIndex > lastIndex) {
    return true;
  }

  // High and critical: no cooldown, always notify
  if (severity === "high" || severity === "critical") {
    return true;
  }

  // Warning: only notify if cooldown elapsed
  if (severity === "warning") {
    const elapsed = Date.now() - state.lastNotifiedAt;
    return elapsed >= COOLDOWN_MS;
  }

  return false;
}

/**
 * Updates alert state after notifying.
 */
function markNotified(windowKey: string, severity: RiskSeverity): void {
  windowAlerts.set(windowKey, {
    lastSeverity: severity,
    lastNotifiedAt: Date.now(),
  });
}

/**
 * Formats the warning message for the notification.
 */
function formatWarningMessage(provider: string, windows: WindowRisk[]): string {
  const lines = windows.map(({ window, risk }) => {
    const reset = formatResetTime(window.resetsAt);
    const status = risk.severity;
    const statusLabel = status !== "none" ? ` (${status})` : "";
    const projected = Math.round(risk.projectedPercent);
    const used = Math.round(window.usedPercent);
    return `- ${window.label}: ${used}% used, projected ${projected}%${statusLabel}, resets ${reset}`;
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

  const providerKey = getProviderKeyFromModel(model);
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
    const highRiskWindows = findHighRiskWindows(
      limits,
      providerKey,
      modelFamily,
    );
    if (highRiskWindows.length === 0) return;

    // Filter to only windows that should be notified
    const windowsToNotify = skipAlreadyWarned
      ? highRiskWindows.filter(({ window, risk }) => {
          const key = getWindowKey(limits.provider, window.label);
          return shouldNotify(key, risk.severity);
        })
      : highRiskWindows;

    if (windowsToNotify.length === 0) return;

    // Mark all high-risk windows as notified (not just the ones triggering notification)
    // This ensures we track severity changes properly
    for (const { window, risk } of highRiskWindows) {
      const key = getWindowKey(limits.provider, window.label);
      markNotified(key, risk.severity);
    }

    const message = formatWarningMessage(limits.provider, windowsToNotify);

    // Determine severity based on highest projected usage
    const hasCritical = windowsToNotify.some(
      ({ risk }) => risk.severity === "critical",
    );
    const hasHigh = windowsToNotify.some(
      ({ risk }) => risk.severity === "high",
    );
    const notifyLevel = hasCritical ? "error" : hasHigh ? "error" : "warning";

    ctx.ui.notify(message, notifyLevel);

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
  // Session start: reset local warning state and run an immediate check for the
  // current model/provider so warnings can appear without requiring a model toggle.
  pi.on("session_start", async (_event, ctx) => {
    windowAlerts.clear();
    triggerRateLimitCheck(ctx, ctx.model, false);
  });

  // Check after agent turn - only warn for newly crossed thresholds
  pi.on("agent_end", async (_event, ctx) => {
    triggerRateLimitCheck(ctx, ctx.model, true);
  });

  // Check when model changes - reset for new provider, show all high usage
  pi.on("model_select", async (event, ctx) => {
    // Clear warnings since we're switching providers
    windowAlerts.clear();
    triggerRateLimitCheck(ctx, event.model, false);
  });
}
