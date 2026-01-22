import type { Model } from "@mariozechner/pi-ai";
import type {
  AuthStorage,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { type Component, truncateToWidth } from "@mariozechner/pi-tui";
import { fetchClaudeRateLimits } from "../providers/claude";
import { fetchCodexRateLimits } from "../providers/codex";
import { fetchOpencodeRateLimits } from "../providers/opencode";
import type { ProviderRateLimits, RateLimitWindow } from "../types";

const WIDGET_ID = "usage-bar";

type ProviderKey = "anthropic" | "openai-codex" | "opencode";
type ClaudeModelFamily = "opus" | "sonnet" | null;

const PROVIDER_DISPLAY_NAMES: Record<ProviderKey, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
  opencode: "Opencode",
};

// State
let cachedLimits: ProviderRateLimits | null = null;
let cachedProviderKey: ProviderKey | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Maps a model provider to the rate limit provider key.
 */
// biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
function getProviderKey(model: Model<any> | undefined): ProviderKey | null {
  if (!model) return null;
  const provider = model.provider.toLowerCase();
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai-codex") return "openai-codex";
  if (provider === "opencode") return "opencode";
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
    case "opencode":
      return fetchOpencodeRateLimits(signal);
    default:
      return null;
  }
}

/**
 * Formats the time remaining until reset.
 */
function formatTimeRemaining(date: Date | null): string {
  if (!date) return "??";
  const now = Date.now();
  const diff = date.getTime() - now;
  if (diff <= 0) return "0m";

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Creates a compact progress bar with theme colors.
 */
function createProgressBar(
  percent: number,
  width: number,
  theme: Theme,
  pacePercent?: number | null,
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  const filledChar = "━";
  const emptyChar = "─";

  // Color based on usage level
  let fillColor: "success" | "warning" | "error" = "success";
  if (clamped >= 80) fillColor = "error";
  else if (clamped >= 60) fillColor = "warning";

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
 * Gets short label for a rate limit window.
 */
function getShortLabel(window: RateLimitWindow): string {
  const label = window.label.toLowerCase();
  if (label.includes("5-hour") || label.includes("5h")) {
    return "5h";
  }
  if (
    label.includes("7-day") ||
    label.includes("week") ||
    label.includes("weekly")
  ) {
    return "Week";
  }
  return window.label;
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

/**
 * Calculates fixed width for a window (everything except the bar).
 * Format: "Label (Xh left) [bar] X% used"
 */
function getWindowFixedWidth(window: RateLimitWindow): number {
  const label = getShortLabel(window);
  const timeLeft = formatTimeRemaining(window.resetsAt);
  const percent = Math.round(window.usedPercent);
  // "Label (time left) " + " X% used"
  // label + " (" + time + " left) " + " " + percent + "% used"
  return (
    label.length + 2 + timeLeft.length + 7 + 1 + String(percent).length + 6
  );
}

/**
 * Renders a single rate limit window as a compact string.
 */
function renderWindow(
  window: RateLimitWindow,
  barWidth: number,
  theme: Theme,
): string {
  const timeLeft = formatTimeRemaining(window.resetsAt);
  const percent = Math.round(window.usedPercent);
  const pacePercent = getPacePercent(window);
  const bar = createProgressBar(
    window.usedPercent,
    barWidth,
    theme,
    pacePercent,
  );
  const shortLabel = getShortLabel(window);

  return `${shortLabel} (${timeLeft} left) ${bar} ${percent}% used`;
}

/**
 * Widget component for usage bar.
 */
class UsageBarWidget implements Component {
  private theme: Theme;
  private limits: ProviderRateLimits | null;
  private providerKey: ProviderKey;
  private modelFamily: ClaudeModelFamily;
  private loading: boolean;

  constructor(
    theme: Theme,
    limits: ProviderRateLimits | null,
    providerKey: ProviderKey,
    modelFamily: ClaudeModelFamily,
    loading: boolean,
  ) {
    this.theme = theme;
    this.limits = limits;
    this.providerKey = providerKey;
    this.modelFamily = modelFamily;
    this.loading = loading;
  }

  render(width: number): string[] {
    const th = this.theme;
    const displayName = PROVIDER_DISPLAY_NAMES[this.providerKey];
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
      this.providerKey === "anthropic"
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
 * Updates the widget display.
 */
function updateWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  const providerKey = getProviderKey(ctx.model);
  if (!providerKey) {
    ctx.ui.setWidget(WIDGET_ID, undefined);
    return;
  }

  const modelFamily = getClaudeModelFamily(ctx.model);
  const loading = !cachedLimits || cachedProviderKey !== providerKey;

  ctx.ui.setWidget(
    WIDGET_ID,
    (_tui, theme) =>
      new UsageBarWidget(
        theme,
        cachedLimits,
        providerKey,
        modelFamily,
        loading,
      ),
    { placement: "belowEditor" },
  );
}

/**
 * Fetches and caches rate limits, then updates the widget.
 */
async function refreshRateLimits(ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) return;

  const providerKey = getProviderKey(ctx.model);
  if (!providerKey) {
    cachedLimits = null;
    cachedProviderKey = null;
    updateWidget(ctx);
    return;
  }

  try {
    const limits = await fetchProviderRateLimits(
      providerKey,
      ctx.modelRegistry.authStorage,
    );
    if (limits) {
      cachedLimits = limits;
      cachedProviderKey = providerKey;
    }
  } catch {
    // Keep existing cache on error
  }

  updateWidget(ctx);
}

/**
 * Starts the periodic refresh interval.
 */
function startRefreshInterval(ctx: ExtensionContext): void {
  stopRefreshInterval();
  refreshInterval = setInterval(() => {
    refreshRateLimits(ctx).catch(() => {});
  }, 60 * 1000);
}

/**
 * Stops the periodic refresh interval.
 */
function stopRefreshInterval(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export function setupUsageBarHooks(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    refreshRateLimits(ctx).catch(() => {});
    startRefreshInterval(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    cachedLimits = null;
    cachedProviderKey = null;
    refreshRateLimits(ctx).catch(() => {});
  });

  pi.on("agent_end", async (_event, ctx) => {
    refreshRateLimits(ctx).catch(() => {});
  });

  pi.on("session_shutdown", async () => {
    stopRefreshInterval();
  });
}
