import {
  type AuthStorage,
  BorderedLoader,
  type ExtensionAPI,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import {
  type Component,
  matchesKey,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { fetchAllProviderRateLimits } from "../rate-limits";
import {
  assessWindowRisk,
  getPacePercent,
  getSeverityColor,
} from "../rate-limits/projection";
import type { ProviderRateLimits, RateLimitWindow } from "../types";
import { getLocalTimezone } from "../utils";

// === Width-safe rendering utilities ===

function ensureWidth(lines: string[], width: number, theme: Theme): string[] {
  return lines.map((line) => {
    const lineWidth = visibleWidth(line);
    if (lineWidth <= width) return line;
    const wrapped = wrapTextWithAnsi(line, width);
    if (wrapped.length > 0 && visibleWidth(wrapped[0] ?? "") <= width) {
      return wrapped[0] ?? "";
    }
    return truncateToWidthSafe(line, width, theme);
  });
}

function truncateToWidthSafe(
  text: string,
  width: number,
  theme: Theme,
): string {
  if (width <= 0) return "";
  const visible = visibleWidth(text);
  if (visible <= width) return text;
  if (width <= 3) return text.slice(0, width);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
  const ansiRegex = /\u001b\[[0-9;]*m/g;
  const plainText = text.replace(ansiRegex, "");
  const truncated = plainText.slice(0, Math.max(0, width - 3));
  return `${truncated}${theme.fg("dim", "...")}`;
}

function formatUiResetTime(date: Date | null, _timezone: string): string {
  if (!date) return "Unknown";

  const now = new Date();
  const remainingMs = date.getTime() - now.getTime();
  if (remainingMs <= 0) return "soon";

  const totalMinutes = Math.ceil(remainingMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d${hours}h remaining` : `${days}d remaining`;
  }
  if (hours > 0) {
    const mm = String(minutes).padStart(2, "0");
    return `${hours}h${mm}m remaining`;
  }
  return `${minutes}m remaining`;
}

function formatWindowUsedLabel(
  providerId: string | undefined,
  window: RateLimitWindow,
): string {
  const percent = Math.round(window.usedPercent);
  const normalized = (providerId ?? "").toLowerCase();
  const isSynthetic = normalized === "synthetic";
  const isZai = normalized === "z-ai" || normalized === "zai";
  const limit = window.limitValue;

  if ((isSynthetic || isZai) && Number.isFinite(limit ?? NaN)) {
    return `${percent}%/${Math.round(limit as number).toLocaleString()}`;
  }

  return `${percent}%`;
}

function renderWindowBlock(
  providerId: string | undefined,
  window: RateLimitWindow,
  width: number,
  theme: Theme,
  timezone: string,
): string[] {
  const lines: string[] = [];
  const barWidth = Math.min(50, Math.max(20, width - 20));

  const risk = assessWindowRisk(window);
  const pacePercent = getPacePercent(window);
  const usedStr = formatWindowUsedLabel(providerId, window);
  const severityColor = getSeverityColor(risk.severity);

  lines.push(`  ${theme.fg("accent", window.label)}`);

  const bar = renderProgressBar(
    window.usedPercent,
    barWidth,
    theme,
    severityColor,
    pacePercent,
  );
  const usedColored = theme.fg(severityColor, usedStr);
  lines.push(`  ${bar} ${usedColored}`);

  // Metadata line: projection + pace info left, remaining right
  const resetStr = formatUiResetTime(window.resetsAt, timezone);
  const projected = Math.round(risk.projectedPercent);

  const leftParts: string[] = [];
  if (projected > 0) {
    const projStr = `proj ${projected}%`;
    const projColored =
      risk.severity !== "none"
        ? theme.fg(severityColor, projStr)
        : theme.fg("dim", projStr);
    leftParts.push(projColored);
  }

  if (pacePercent !== null) {
    const paceDiff = window.usedPercent - pacePercent;
    if (paceDiff > 0) {
      leftParts.push(
        theme.fg("dim", `${Math.round(Math.abs(paceDiff))}% ahead pace`),
      );
    }
  }

  const leftStr = leftParts.join("  ");
  const rightStr = theme.fg("dim", resetStr);
  const leftW = visibleWidth(leftStr);
  const rightW = visibleWidth(rightStr);
  const gap = Math.max(2, barWidth - leftW - rightW);
  lines.push(`  ${leftStr}${" ".repeat(gap)}${rightStr}`);

  return lines;
}

function renderProgressBar(
  percent: number,
  width: number,
  theme: Theme,
  fillColor: "success" | "warning" | "error",
  pacePercent?: number | null,
): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  // Only show pace when it's ahead of actual (not exceeded)
  const paceIndex =
    pacePercent === null || pacePercent === undefined || pacePercent <= percent
      ? null
      : Math.round((Math.max(0, Math.min(100, pacePercent)) / 100) * width);
  const filledChar = "\u2588";
  const paceChar = "\u2593";
  const emptyChar = "\u2591";

  const parts: string[] = [];
  for (let idx = 0; idx < width; idx++) {
    if (idx < filled) {
      parts.push(theme.fg(fillColor, filledChar));
    } else if (paceIndex !== null && idx < paceIndex) {
      parts.push(theme.fg(fillColor, paceChar));
    } else {
      parts.push(theme.fg("dim", emptyChar));
    }
  }

  return parts.join("");
}

// === Main component ===

interface PanelTab {
  label: string;
  buildContent: (width: number, theme: Theme) => string[];
}

class ProvidersUsagePanel implements Component {
  private activeTab = 0;
  private scrollOffset = 0;
  private cachedLines: string[] | null = null;
  private cachedWidth = 0;
  private onClose: () => void;
  private rateLimits: ProviderRateLimits[];
  private activeProvider: string | undefined;
  private theme: Theme;

  constructor(
    _tui: TUI,
    theme: Theme,
    rateLimits: ProviderRateLimits[],
    activeProvider: string | undefined,
    onClose: () => void,
  ) {
    this.theme = theme;
    this.onClose = onClose;
    this.rateLimits = rateLimits;
    this.activeProvider = activeProvider;
  }

  private getTabs(): PanelTab[] {
    const sorted = [...this.rateLimits].sort((a, b) => {
      if (this.activeProvider) {
        const normalize = (id: string) => id.replace(/[-_]/g, "").toLowerCase();
        const activeNorm = normalize(this.activeProvider);
        const aMatch = a.providerId
          ? normalize(a.providerId) === activeNorm
          : false;
        const bMatch = b.providerId
          ? normalize(b.providerId) === activeNorm
          : false;
        if (aMatch) return -1;
        if (bMatch) return 1;
      }
      return a.provider.localeCompare(b.provider);
    });

    return sorted.map((provider) => ({
      label: provider.provider,
      buildContent: (width: number, theme: Theme) =>
        this.buildProviderTab(provider, width, theme),
    }));
  }

  private buildProviderTab(
    provider: ProviderRateLimits,
    width: number,
    theme: Theme,
  ): string[] {
    const lines: string[] = [];
    const timezone = getLocalTimezone();

    let statusColor: "success" | "warning" | "error" | "dim" = "dim";
    let statusText = "Unknown";
    switch (provider.status) {
      case "operational":
        statusColor = "success";
        statusText = "Operational";
        break;
      case "degraded":
        statusColor = "warning";
        statusText = "Degraded";
        break;
      case "outage":
        statusColor = "error";
        statusText = "Outage";
        break;
    }
    lines.push(`Status: ${theme.fg(statusColor, `\u25cf ${statusText}`)}`);
    lines.push("");

    if (provider.error) {
      lines.push(theme.fg("error", `Error: ${provider.error}`));
      return lines;
    }

    if (!provider.windows.length) {
      lines.push(theme.fg("dim", "No rate limit data"));
      return lines;
    }

    for (const window of provider.windows) {
      lines.push(
        ...renderWindowBlock(
          provider.providerId,
          window,
          width,
          theme,
          timezone,
        ),
      );
      lines.push("");
    }

    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines;
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return true;
    }

    const tabs = this.getTabs();

    if (matchesKey(data, "tab")) {
      this.activeTab = (this.activeTab + 1) % tabs.length;
      this.scrollOffset = 0;
      this.invalidate();
      return true;
    }

    if (matchesKey(data, "shift+tab")) {
      this.activeTab = (this.activeTab - 1 + tabs.length) % tabs.length;
      this.scrollOffset = 0;
      this.invalidate();
      return true;
    }

    const maxVisible = 14;
    const totalLines = this.cachedLines?.length ?? 0;
    const maxScroll = Math.max(0, totalLines - maxVisible);

    if (data === "j" || matchesKey(data, "down")) {
      if (this.scrollOffset < maxScroll) {
        this.scrollOffset++;
      }
      return true;
    }

    if (data === "k" || matchesKey(data, "up")) {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
      }
      return true;
    }

    if (data === " " || matchesKey(data, "pageDown")) {
      this.scrollOffset = Math.min(this.scrollOffset + maxVisible, maxScroll);
      return true;
    }

    if (matchesKey(data, "pageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - maxVisible);
      return true;
    }

    return false;
  }

  render(width: number): string[] {
    const tabs = this.getTabs();
    const contentWidth = Math.max(1, width - 2);
    const theme = this.theme;

    if (!this.cachedLines || this.cachedWidth !== width) {
      const tab = tabs[this.activeTab];
      this.cachedLines = tab ? tab.buildContent(contentWidth, theme) : [];
      this.cachedWidth = width;
    }

    const maxVisible = 14;
    const totalLines = this.cachedLines.length;
    const lines: string[] = [];

    const borderChar = "\u2500";
    lines.push(theme.fg("border", borderChar.repeat(width)));

    lines.push(
      truncateToWidthSafe(
        ` ${theme.fg("accent", theme.bold("Provider Usage"))}`,
        width,
        theme,
      ),
    );

    lines.push(this.renderTabBar(width, theme, tabs));
    lines.push("");

    if (this.scrollOffset > 0) {
      lines.push(
        truncateToWidthSafe(
          theme.fg("dim", `  \u2191 ${this.scrollOffset} lines above`),
          width,
          theme,
        ),
      );
    } else {
      lines.push("");
    }

    const end = Math.min(this.scrollOffset + maxVisible, totalLines);
    for (let i = this.scrollOffset; i < end; i++) {
      lines.push(
        truncateToWidthSafe(`  ${this.cachedLines[i] ?? ""}`, width, theme),
      );
    }

    const shown = end - this.scrollOffset;
    for (let i = shown; i < maxVisible; i++) {
      lines.push("");
    }

    const remaining = totalLines - this.scrollOffset - maxVisible;
    if (remaining > 0) {
      lines.push(
        truncateToWidthSafe(
          theme.fg("dim", `  \u2193 ${remaining} lines below`),
          width,
          theme,
        ),
      );
    } else {
      lines.push("");
    }

    lines.push("");
    const footer = this.renderFooter(width, remaining > 0);
    lines.push(truncateToWidthSafe(footer, width, theme));

    lines.push(theme.fg("border", borderChar.repeat(width)));

    return ensureWidth(lines, width, theme);
  }

  private renderTabBar(width: number, theme: Theme, tabs: PanelTab[]): string {
    const parts: string[] = [];

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (!tab) continue;
      const active = i === this.activeTab;

      if (active) {
        parts.push(theme.fg("accent", theme.bold(` ${tab.label} `)));
      } else {
        parts.push(theme.fg("dim", ` ${tab.label} `));
      }

      if (i < tabs.length - 1) {
        parts.push(theme.fg("borderMuted", "\u2502"));
      }
    }

    return truncateToWidthSafe(`  ${parts.join("")}`, width, theme);
  }

  private renderFooter(width: number, canScroll: boolean): string {
    let left = "Tab switch";
    if (canScroll) left += "  j/k scroll";

    const right = "q close";

    const leftWidth = visibleWidth(left);
    const rightWidth = visibleWidth(right);
    const gap = Math.max(2, width - leftWidth - rightWidth - 4);

    return `  ${left}${" ".repeat(gap)}${right}`;
  }

  invalidate(): void {
    this.cachedLines = null;
    this.cachedWidth = 0;
  }
}

// === Data loading ===

async function loadUsageData(
  signal: AbortSignal,
  authStorage: AuthStorage,
): Promise<ProviderRateLimits[]> {
  return fetchAllProviderRateLimits(authStorage, signal);
}

// === Command registration ===

export function setupUsageCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:usage", {
    description: "Show usage statistics dashboard",
    handler: async (_args, cmdCtx) => {
      if (!cmdCtx.hasUI) {
        cmdCtx.ui.notify("/providers:usage requires interactive mode", "error");
        return;
      }

      const authStorage = cmdCtx.modelRegistry.authStorage;
      const activeProvider = cmdCtx.model?.provider;

      await cmdCtx.ui.custom((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, "Loading usage...");
        loader.onAbort = () => done(undefined);

        let panel: ProvidersUsagePanel | null = null;

        loadUsageData(loader.signal, authStorage)
          .then((rateLimits) => {
            if (loader.signal.aborted) return;
            panel = new ProvidersUsagePanel(
              tui,
              theme,
              rateLimits,
              activeProvider,
              () => done(undefined),
            );
            tui.requestRender();
          })
          .catch(() => {
            if (loader.signal.aborted) return;
            panel = new ProvidersUsagePanel(
              tui,
              theme,
              [],
              activeProvider,
              () => done(undefined),
            );
            tui.requestRender();
          });

        return {
          handleInput: (data: string) => {
            if (panel) {
              return panel.handleInput(data);
            }
            return loader.handleInput(data);
          },
          render: (width: number) => {
            if (panel) {
              return panel.render(width);
            }
            return loader.render(width);
          },
          invalidate: () => {
            panel?.invalidate();
            loader.invalidate();
          },
          dispose: () => {
            loader.dispose();
          },
        };
      });
    },
  });
}
