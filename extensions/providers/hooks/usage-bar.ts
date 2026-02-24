import type { Model } from "@mariozechner/pi-ai";
import type {
  AuthStorage,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { type Component, truncateToWidth } from "@mariozechner/pi-tui";
import {
  configLoader,
  getBaseProvider,
  getProviderDisplayName,
  getProviderSettings,
  type ProviderKey,
} from "../config";
import { fetchClaudeRateLimits } from "../rate-limits/claude";
import { fetchCodexRateLimits } from "../rate-limits/codex";
import {
  assessWindowRisk,
  getSeverityColor,
  inferWindowSeconds,
} from "../rate-limits/projection";
import { fetchSyntheticRateLimits } from "../rate-limits/synthetic";
import type { ProviderRateLimits, RateLimitWindow } from "../types";

const WIDGET_ID = "usage-bar";

type ClaudeModelFamily = "opus" | "sonnet" | null;

// State
let cachedLimits: ProviderRateLimits | null = null;
let cachedProviderId: string | null = null;
let lastFetchTime: number | null = null;
let forceVisible = false;

function getRefreshIntervalMs(): number {
  return configLoader.getConfig().refreshIntervalMinutes * 60 * 1000;
}

/**
 * Maps a model provider to the base provider key.
 * Handles both base providers and account IDs.
 */
// biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
function getProviderKey(model: Model<any> | undefined): ProviderKey | null {
  if (!model) return null;
  const provider = model.provider.toLowerCase();

  // Check for exact base provider match
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai-codex") return "openai-codex";
  if (provider === "synthetic") return "synthetic";

  // Check for account pattern (e.g., "openai-codex-work")
  return getBaseProvider(provider);
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

/**
 * Fetches rate limits for a specific provider.
 * For accounts, pass the account ID as providerId.
 */
async function fetchProviderRateLimits(
  providerKey: ProviderKey,
  authStorage: AuthStorage,
  signal?: AbortSignal,
  providerId?: string,
): Promise<ProviderRateLimits | null> {
  switch (providerKey) {
    case "anthropic":
      return fetchClaudeRateLimits(authStorage, signal, providerId);
    case "openai-codex":
      return fetchCodexRateLimits(authStorage, signal, providerId);
    case "synthetic":
      return fetchSyntheticRateLimits(signal);
    default:
      return null;
  }
}

/**
 * Formats durations as decimals based on the total window size.
 */
function getDurationUnit(totalSeconds: number): {
  label: "d" | "h" | "m";
  seconds: number;
} {
  if (totalSeconds >= 24 * 60 * 60)
    return { label: "d", seconds: 24 * 60 * 60 };
  if (totalSeconds >= 60 * 60) return { label: "h", seconds: 60 * 60 };
  return { label: "m", seconds: 60 };
}

function formatDurationDecimal(
  seconds: number,
  unit: { label: "d" | "h" | "m"; seconds: number },
): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return `0${unit.label}`;
  const value = seconds / unit.seconds;
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1);
  return `${text}${unit.label}`;
}

function formatDurationPairSeconds(
  elapsedSeconds: number,
  totalSeconds: number,
): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "??/??";
  const unit = getDurationUnit(totalSeconds);
  const elapsedText = formatDurationDecimal(elapsedSeconds, unit);
  const totalText = formatDurationDecimal(totalSeconds, unit);
  return `${elapsedText}/${totalText}`;
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

function getWindowProgressText(window: RateLimitWindow): string {
  const windowSeconds =
    window.windowSeconds ?? inferWindowSeconds(window.label);
  if (!windowSeconds || !window.resetsAt) return "??/??";
  const totalMs = windowSeconds * 1000;
  const remainingMs = window.resetsAt.getTime() - Date.now();
  const elapsedMs = Math.min(totalMs, Math.max(0, totalMs - remainingMs));
  return formatDurationPairSeconds(elapsedMs / 1000, windowSeconds);
}

type FillColor = "success" | "warning" | "error";

function getFillColorFromSeverity(
  severity: ReturnType<typeof assessWindowRisk>["severity"],
): FillColor {
  return getSeverityColor(severity);
}

/**
 * Creates a compact progress bar with theme colors.
 */
function createProgressBar(
  percent: number,
  width: number,
  theme: Theme,
  fillColor: FillColor,
  pacePercent?: number | null,
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  const filledChar = "━";
  const emptyChar = "─";

  const markerChar = "│";
  const markerIndex =
    pacePercent === null || pacePercent === undefined
      ? null
      : Math.max(
          0,
          Math.min(width - 1, Math.round((pacePercent / 100) * (width - 1))),
        );

  const parts: string[] = [];
  for (let idx = 0; idx < width; idx += 1) {
    if (markerIndex === idx) {
      parts.push(theme.fg("accent", markerChar));
      continue;
    }
    if (idx < filled) {
      parts.push(theme.fg(fillColor, filledChar));
    } else {
      parts.push(theme.fg("dim", emptyChar));
    }
  }

  return parts.join("");
}

/**
 * Calculates fixed width for a window (everything except the bar).
 * Format: "(elapsed/total) [bar] X%"
 */
function getWindowFixedWidth(window: RateLimitWindow): number {
  const progressText = getWindowProgressText(window);
  const percent = Math.round(window.usedPercent);
  // "(elapsed/total) " + " X%"
  // "(" + progress + ") " + " " + percent + "%"
  return 1 + progressText.length + 2 + 1 + String(percent).length + 1;
}

/**
 * Renders a single rate limit window as a compact string.
 */
function renderWindow(
  window: RateLimitWindow,
  barWidth: number,
  theme: Theme,
): string {
  const progressText = getWindowProgressText(window);
  const percent = Math.round(window.usedPercent);
  const pacePercent = getPacePercent(window);
  const risk = assessWindowRisk(window);
  const fillColor = getFillColorFromSeverity(risk.severity);
  const bar = createProgressBar(
    window.usedPercent,
    barWidth,
    theme,
    fillColor,
    pacePercent,
  );
  const percentLabel = theme.fg(fillColor, `${percent}%`);

  return `(${progressText}) ${bar} ${percentLabel}`;
}

/**
 * Widget component for usage bar.
 */
class UsageBarWidget implements Component {
  private theme: Theme;
  private limits: ProviderRateLimits | null;
  private providerId: string;
  private modelFamily: ClaudeModelFamily;
  private loading: boolean;

  constructor(
    theme: Theme,
    limits: ProviderRateLimits | null,
    providerId: string,
    modelFamily: ClaudeModelFamily,
    loading: boolean,
  ) {
    this.theme = theme;
    this.limits = limits;
    this.providerId = providerId;
    this.modelFamily = modelFamily;
    this.loading = loading;
  }

  render(width: number): string[] {
    const th = this.theme;
    const displayName = getProviderDisplayName(this.providerId);
    const separator = th.fg("borderMuted", "─".repeat(width));

    if (this.loading || !this.limits) {
      const content = `${th.fg("accent", displayName)}${th.fg("dim", " Loading...")}`;
      return [truncateToWidth(content, width), separator];
    }

    if (this.limits.error) {
      const content = `${th.fg("dim", displayName)}${th.fg("error", ` (${this.limits.error})`)}`;
      return [truncateToWidth(content, width), separator];
    }

    if (!this.limits.windows.length) {
      const content = `${th.fg("dim", displayName)} (no data)`;
      return [truncateToWidth(content, width), separator];
    }

    // Filter windows for Claude based on current model family
    const windows =
      getBaseProvider(this.providerId) === "anthropic"
        ? filterClaudeWindows(this.limits.windows, this.modelFamily)
        : this.limits.windows;

    if (!windows.length) {
      const content = `${th.fg("dim", displayName)} (no data)`;
      return [truncateToWidth(content, width), separator];
    }

    const pipeSeparatorWidth = 3; // " | "

    // Calculate fixed width: provider name + separators + fixed parts of each window
    let fixedWidth = displayName.length;
    fixedWidth += pipeSeparatorWidth * windows.length; // separator after provider + between windows
    for (const window of windows) {
      fixedWidth += getWindowFixedWidth(window);
    }

    // Remaining width is distributed among progress bars
    const remainingWidth = Math.max(0, width - fixedWidth);
    const barWidth = Math.max(10, Math.floor(remainingWidth / windows.length));

    // Build content
    const parts: string[] = [];
    parts.push(th.fg("accent", displayName));

    for (const window of windows) {
      parts.push(renderWindow(window, barWidth, th));
    }

    const pipeSeparator = th.fg("dim", " | ");
    const content = parts.join(pipeSeparator);
    return [truncateToWidth(content, width), separator];
  }

  invalidate(): void {}
}

/**
 * Computes whether the widget should be visible based on current data.
 * Shows when any window's severity is warning/high/critical or there's an error.
 */
function computeVisibility(
  limits: ProviderRateLimits | null,
  providerId: string,
  modelFamily: ClaudeModelFamily,
): boolean {
  if (!limits) return false;
  if (limits.error) return true;

  const windows =
    getBaseProvider(providerId) === "anthropic"
      ? filterClaudeWindows(limits.windows, modelFamily)
      : limits.windows;

  for (const window of windows) {
    const risk = assessWindowRisk(window);
    if (risk.severity !== "none") return true;
  }
  return false;
}

/**
 * Force-shows the widget (e.g. when a rate limit notification fires).
 * Cleared on next successful refresh.
 */
export function forceShowWidget(ctx: ExtensionContext): void {
  forceVisible = true;
  updateWidget(ctx);
}

/**
 * Re-evaluates widget visibility from current config/state.
 * Call after changing memory config.
 */
export function refreshWidget(ctx: ExtensionContext): void {
  updateWidget(ctx);
}

/**
 * Updates the widget display.
 * Respects per-provider widget mode from config:
 * - "always": always show
 * - "never": never show
 * - "warnings-only": show when usage is near limits, there's an error, or force-visible
 */
function updateWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  const providerId = ctx.model?.provider ?? null;
  if (!providerId) {
    ctx.ui.setWidget(WIDGET_ID, undefined);
    return;
  }

  const settings = getProviderSettings(providerId);
  const modelFamily = getClaudeModelFamily(ctx.model);

  let visible: boolean;
  switch (settings.widget) {
    case "always":
      visible = true;
      break;
    case "never":
      visible = false;
      break;
    case "warnings-only":
      visible =
        forceVisible ||
        computeVisibility(cachedLimits, providerId, modelFamily);
      break;
  }

  if (!visible) {
    ctx.ui.setWidget(WIDGET_ID, undefined);
    return;
  }

  const loading = !cachedLimits || cachedProviderId !== providerId;

  ctx.ui.setWidget(
    WIDGET_ID,
    (_tui, theme) =>
      new UsageBarWidget(theme, cachedLimits, providerId, modelFamily, loading),
    { placement: "belowEditor" },
  );
}

/**
 * Returns true if enough time has passed since the last fetch.
 */
function shouldRefresh(): boolean {
  if (!lastFetchTime) return true;
  return Date.now() - lastFetchTime >= getRefreshIntervalMs();
}

/**
 * Fetches and caches rate limits, then updates the widget.
 * If `force` is false, skips the fetch when less than MIN_REFRESH_MS has elapsed.
 */
async function refreshRateLimits(
  ctx: ExtensionContext,
  force = false,
): Promise<void> {
  if (!ctx.hasUI) return;

  const providerId = ctx.model?.provider ?? null;
  if (!providerId) {
    cachedLimits = null;
    cachedProviderId = null;
    updateWidget(ctx);
    return;
  }

  const providerKey = getProviderKey(ctx.model);
  if (!providerKey) {
    cachedLimits = null;
    cachedProviderId = null;
    updateWidget(ctx);
    return;
  }

  // Skip fetch if not enough time has passed (unless forced)
  if (!force && !shouldRefresh()) {
    updateWidget(ctx);
    return;
  }

  try {
    const limits = await fetchProviderRateLimits(
      providerKey,
      ctx.modelRegistry.authStorage,
      undefined,
      providerId,
    );
    if (limits) {
      cachedLimits = limits;
      cachedProviderId = providerId;
      lastFetchTime = Date.now();
      // Clear force flag on successful refresh; visibility is now data-driven
      forceVisible = false;
    }
  } catch {
    // Keep existing cache on error
  }

  updateWidget(ctx);
}

export function setupUsageBarHooks(pi: ExtensionAPI): void {
  // Session start: reset local state only. Defer network fetch until model change
  // or first agent turn completion.
  pi.on("session_start", async (_event, _ctx) => {
    cachedLimits = null;
    cachedProviderId = null;
    lastFetchTime = null;
    forceVisible = false;
  });

  // Model change: always fetch (force), reset cache
  pi.on("model_select", async (_event, ctx) => {
    cachedLimits = null;
    cachedProviderId = null;
    lastFetchTime = null;
    refreshRateLimits(ctx, true).catch(() => {});
  });

  // After agent turn: fetch only if 5+ min since last fetch
  pi.on("agent_end", async (_event, ctx) => {
    refreshRateLimits(ctx).catch(() => {});
  });
}
