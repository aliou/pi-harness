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
import { fetchOpenCodeRateLimits } from "../providers/opencode";
import type { ProviderRateLimits, RateLimitWindow } from "../types";

const WIDGET_ID = "usage-bar";

type ProviderKey = "anthropic" | "openai-codex" | "opencode";

const PROVIDER_DISPLAY_NAMES: Record<ProviderKey, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
  opencode: "OpenCode",
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
      return fetchOpenCodeRateLimits(signal);
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
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  const filledChar = "━";
  const emptyChar = "─";

  // Color based on usage level
  let fillColor: "success" | "warning" | "error" = "success";
  if (clamped >= 80) fillColor = "error";
  else if (clamped >= 60) fillColor = "warning";

  return (
    theme.fg(fillColor, filledChar.repeat(filled)) +
    theme.fg("dim", emptyChar.repeat(empty))
  );
}

/**
 * Gets short label for a rate limit window.
 */
function getShortLabel(window: RateLimitWindow): string {
  if (window.label.includes("5-hour") || window.label.includes("5h")) {
    return "5h";
  }
  if (
    window.label.includes("7-day") ||
    window.label.includes("Week") ||
    window.label.includes("weekly")
  ) {
    return "Week";
  }
  return window.label;
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
  const bar = createProgressBar(window.usedPercent, barWidth, theme);
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
  private loading: boolean;

  constructor(
    theme: Theme,
    limits: ProviderRateLimits | null,
    providerKey: ProviderKey,
    loading: boolean,
  ) {
    this.theme = theme;
    this.limits = limits;
    this.providerKey = providerKey;
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

    const windows = this.limits.windows;
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

  const loading = !cachedLimits || cachedProviderKey !== providerKey;

  ctx.ui.setWidget(
    WIDGET_ID,
    (_tui, theme) =>
      new UsageBarWidget(theme, cachedLimits, providerKey, loading),
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
