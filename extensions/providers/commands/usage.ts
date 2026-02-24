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
import { collectSessionStats } from "../collectors/session-stats";
import { getProviderSettings } from "../config";
import { fetchAllProviderRateLimits } from "../rate-limits";
import {
  assessWindowRisk,
  getPacePercent,
  getSeverityColor,
  inferWindowSeconds,
} from "../rate-limits/projection";
import type {
  ProviderRateLimits,
  RateLimitWindow,
  TabName,
  TimeFilteredStats,
  UsageData,
} from "../types";
import {
  formatCost,
  formatNumber,
  formatResetTime,
  formatTokens,
  getLocalTimezone,
} from "../utils";

const TAB_LABELS: Record<TabName, string> = {
  session: "Session",
  today: "Today",
  thisWeek: "Week",
  allTime: "All Time",
};

// === Width-safe rendering utilities ===

function ensureWidth(lines: string[], width: number, theme: Theme): string[] {
  return lines.map((line) => {
    const lineWidth = visibleWidth(line);
    if (lineWidth <= width) return line;
    // Try wrapping first
    const wrapped = wrapTextWithAnsi(line, width);
    if (wrapped.length > 0 && visibleWidth(wrapped[0] ?? "") <= width) {
      return wrapped[0] ?? "";
    }
    // Fallback: truncate
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
  // Strip ANSI and truncate
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
  const ansiRegex = /\u001b\[[0-9;]*m/g;
  const plainText = text.replace(ansiRegex, "");
  const truncated = plainText.slice(0, Math.max(0, width - 3));
  return `${truncated}${theme.fg("dim", "...")}`;
}

// === Stats table utilities ===

type StatsColumn = {
  label: string;
  minWidth: number;
  getValue: (s: RowStats) => string;
  dimmed?: boolean;
};

type RowStats = {
  sessions: number;
  messages: number;
  cost: number;
  tokens: { total: number; input: number; output: number; cache: number };
};

const STATS_COLUMNS: StatsColumn[] = [
  {
    label: "Sessions",
    minWidth: 8,
    getValue: (s) => formatNumber(s.sessions),
  },
  {
    label: "Msgs",
    minWidth: 6,
    getValue: (s) => formatNumber(s.messages),
  },
  { label: "Cost", minWidth: 8, getValue: (s) => formatCost(s.cost) },
  {
    label: "Tokens",
    minWidth: 8,
    getValue: (s) => formatTokens(s.tokens.total),
  },
  {
    label: "↑In",
    minWidth: 6,
    dimmed: true,
    getValue: (s) => formatTokens(s.tokens.input),
  },
  {
    label: "↓Out",
    minWidth: 6,
    dimmed: true,
    getValue: (s) => formatTokens(s.tokens.output),
  },
  {
    label: "Cache",
    minWidth: 6,
    dimmed: true,
    getValue: (s) => formatTokens(s.tokens.cache),
  },
];

// === Session tab: hybrid layout (bar + metadata) ===

function buildSessionTabContent(
  width: number,
  theme: Theme,
  data: UsageData,
  activeProvider: string | undefined,
): string[] {
  const lines: string[] = [];
  const timezone = getLocalTimezone();

  // Filter out providers with widget: "never"
  const visibleProviders = data.rateLimits.filter((provider) => {
    const id = provider.providerId ?? provider.accountId;
    if (!id) return true;
    const settings = getProviderSettings(id);
    return settings.widget !== "never";
  });

  // Sort providers: active first, then others alphabetically
  const sortedProviders = [...visibleProviders].sort((a, b) => {
    if (activeProvider) {
      // Match by providerId or accountId (normalize by removing hyphens/underscores)
      const normalize = (id: string) => id.replace(/[-_]/g, "").toLowerCase();
      const activeNorm = normalize(activeProvider);
      const aNorm = a.providerId ? normalize(a.providerId) : "";
      const bNorm = b.providerId ? normalize(b.providerId) : "";

      const aMatch = aNorm === activeNorm;
      const bMatch = bNorm === activeNorm;
      if (aMatch) return -1;
      if (bMatch) return 1;
    }
    return a.provider.localeCompare(b.provider);
  });

  for (const provider of sortedProviders) {
    // Provider header with status
    lines.push(...renderProviderHeader(provider, width, theme));
    lines.push("");

    if (provider.error) {
      lines.push(theme.fg("error", `  Error: ${provider.error}`));
      lines.push("");
      continue;
    }

    if (!provider.windows.length) {
      lines.push(theme.fg("dim", "  No rate limit data"));
      lines.push("");
      continue;
    }

    for (const window of provider.windows) {
      lines.push(...renderWindowBlock(window, width, theme, timezone));
    }

    lines.push("");
  }

  if (lines.length === 0) {
    return [theme.fg("dim", "No providers configured")];
  }

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function renderProviderHeader(
  provider: ProviderRateLimits,
  _width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  // Status indicator
  let statusColor: "success" | "warning" | "error" | "dim" = "dim";
  let statusText = "Unknown";
  switch (provider.status) {
    case "operational":
      statusColor = "success";
      statusText = "● Operational";
      break;
    case "degraded":
      statusColor = "warning";
      statusText = "● Degraded";
      break;
    case "outage":
      statusColor = "error";
      statusText = "● Outage";
      break;
  }

  // Format provider name: strip "Plan" suffix, add plan type in parentheses, add "Plan" back
  let providerName = provider.provider;
  const planSuffix = " Plan";
  if (providerName.endsWith(planSuffix)) {
    providerName = providerName.slice(0, -planSuffix.length);
  }

  // Add plan type in parentheses if available
  if (provider.plan && provider.plan.trim()) {
    const planDisplay =
      provider.plan.charAt(0).toUpperCase() + provider.plan.slice(1);
    providerName = `${providerName} (${planDisplay})`;
  }

  // Add "Plan" suffix back
  providerName = `${providerName} Plan`;

  const header = `${providerName}  ${theme.fg(statusColor, statusText)}`;
  lines.push(header);

  return lines;
}

function renderWindowBlock(
  window: RateLimitWindow,
  width: number,
  theme: Theme,
  timezone: string,
): string[] {
  const lines: string[] = [];
  const barWidth = Math.min(50, Math.max(20, width - 20));

  const risk = assessWindowRisk(window);
  const pacePercent = getPacePercent(window);
  const usedStr = `${Math.round(window.usedPercent)}%`;
  const projected = Math.round(risk.projectedPercent);
  const severityColor = getSeverityColor(risk.severity);

  // Window label with progress
  const windowSeconds =
    window.windowSeconds ?? inferWindowSeconds(window.label);
  let progressText = "";
  if (windowSeconds && window.resetsAt) {
    const totalMs = windowSeconds * 1000;
    const remainingMs = window.resetsAt.getTime() - Date.now();
    const elapsedMs = Math.min(totalMs, Math.max(0, totalMs - remainingMs));
    const elapsedH = Math.floor(elapsedMs / (1000 * 60 * 60));
    const elapsedM = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
    const totalH = Math.floor(windowSeconds / (60 * 60));
    progressText =
      elapsedH > 0 || totalH > 0
        ? `${elapsedH}.${Math.floor(elapsedM / 6)}h/${totalH}h`
        : `${elapsedM}m/${Math.floor(windowSeconds / 60)}m`;
  }

  lines.push(`  ${theme.fg("accent", window.label)} (${progressText})`);

  // Bar line
  const bar = renderProgressBar(
    window.usedPercent,
    barWidth,
    theme,
    severityColor,
    pacePercent,
  );
  const usedColored = theme.fg(severityColor, usedStr);
  lines.push(`  ${bar} ${usedColored}`);

  // Metadata line: projected, pace, reset
  const resetStr = formatResetTime(window.resetsAt, timezone);
  let paceStr = "";
  if (pacePercent !== null) {
    const paceDiff = window.usedPercent - pacePercent;
    if (paceDiff > 10) {
      paceStr = `${Math.round(Math.abs(paceDiff))}% ahead pace`;
    } else if (paceDiff < -10) {
      paceStr = `${Math.round(Math.abs(paceDiff))}% behind pace`;
    } else {
      paceStr = "within pace";
    }
  }

  const projStr =
    risk.severity !== "none" ? `proj ${projected}%` : `proj ${projected}%`;
  const projColored =
    risk.severity !== "none"
      ? theme.fg(severityColor, projStr)
      : theme.fg("dim", projStr);

  const metaParts: string[] = [projColored];
  if (paceStr) metaParts.push(theme.fg("dim", paceStr));
  metaParts.push(theme.fg("dim", `resets ${resetStr}`));

  lines.push(`  ${metaParts.join("  ")}`);

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
  const filledChar = "█";
  const emptyChar = "░";
  const markerChar = "│";

  const markerIndex =
    pacePercent === null || pacePercent === undefined
      ? null
      : Math.max(
          0,
          Math.min(width - 1, Math.round((pacePercent / 100) * (width - 1))),
        );

  const parts: string[] = [];
  for (let idx = 0; idx < width; idx++) {
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

// === Time tabs: collapsible provider groups ===

interface StatsViewState {
  selectedProviderIndex: number;
  expandedProviders: Set<string>;
}

function buildStatsTabContent(
  tab: Exclude<TabName, "session">,
  width: number,
  theme: Theme,
  stats: TimeFilteredStats,
  state: StatsViewState,
): string[] {
  const lines: string[] = [];

  // Period progress
  const period = getPeriodProgress(tab);
  if (period) {
    const barWidth = Math.min(50, Math.max(20, width - 20));
    const bar = renderProgressBar(
      period.percent,
      barWidth,
      theme,
      "success",
      period.percent,
    );
    lines.push(
      `${period.label} progress: ${bar} ${Math.round(period.percent)}%`,
    );
    lines.push("");
  }

  if (stats.providers.size === 0) {
    lines.push(theme.fg("dim", "No usage data for this period"));
    return lines;
  }

  // Build table layout
  const layout = buildStatsLayout(width);

  // Header
  lines.push(renderStatsHeader(layout, theme));
  lines.push(theme.fg("dim", "─".repeat(layout.tableWidth)));

  // Providers sorted by cost
  const providers = Array.from(stats.providers.entries()).sort(
    (a, b) => b[1].cost - a[1].cost,
  );

  for (let i = 0; i < providers.length; i++) {
    const [providerName, providerStats] = providers[i] ?? ["", null];
    if (!providerStats) continue;

    const isSelected = i === state.selectedProviderIndex;
    const isExpanded = state.expandedProviders.has(providerName);
    const prefix = isSelected ? "> " : "  ";
    const expandIndicator = isExpanded ? "v" : ">";

    const providerRow = renderStatsRow(
      layout,
      `${expandIndicator} ${providerName}`,
      {
        sessions: providerStats.sessions.size,
        messages: providerStats.messages,
        cost: providerStats.cost,
        tokens: providerStats.tokens,
      },
      theme,
      isSelected,
    );
    lines.push(prefix + providerRow);

    if (isExpanded) {
      const models = Array.from(providerStats.models.entries()).sort(
        (a, b) => b[1].cost - a[1].cost,
      );
      for (const [modelName, modelStats] of models) {
        const modelRow = renderStatsRow(
          layout,
          `    ${modelName}`,
          {
            sessions: modelStats.sessions.size,
            messages: modelStats.messages,
            cost: modelStats.cost,
            tokens: modelStats.tokens,
          },
          theme,
          false,
          true,
        );
        lines.push(modelRow);
      }
    }
  }

  lines.push(theme.fg("dim", "─".repeat(layout.tableWidth)));
  lines.push(
    renderStatsRow(layout, "Totals", {
      sessions: stats.totals.sessions,
      messages: stats.totals.messages,
      cost: stats.totals.cost,
      tokens: stats.totals.tokens,
    }),
  );

  return lines;
}

function getPeriodProgress(
  tab: Exclude<TabName, "session">,
): { label: string; percent: number } | null {
  const now = new Date();

  if (tab === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = now.getTime() - start.getTime();
    const percent = (elapsedMs / totalMs) * 100;
    return { label: "Today", percent: Math.max(0, Math.min(100, percent)) };
  }

  if (tab === "thisWeek") {
    const start = getStartOfWeek(now);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = now.getTime() - start.getTime();
    const percent = (elapsedMs / totalMs) * 100;
    return { label: "Week", percent: Math.max(0, Math.min(100, percent)) };
  }

  return null;
}

function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

interface StatsLayout {
  nameWidth: number;
  columns: {
    label: string;
    width: number;
    getValue: (s: RowStats) => string;
    dimmed?: boolean;
  }[];
  tableWidth: number;
}

function buildStatsLayout(width: number): StatsLayout {
  const availableWidth = Math.max(60, width - 4);
  const nameWidth = Math.min(
    25,
    Math.max(16, Math.floor(availableWidth * 0.3)),
  );
  const remainingWidth = availableWidth - nameWidth;

  // Distribute remaining width among columns
  const totalMinWidth = STATS_COLUMNS.reduce(
    (sum, col) => sum + col.minWidth,
    0,
  );
  const extraWidth = Math.max(0, remainingWidth - totalMinWidth);
  const extraPerColumn = Math.floor(extraWidth / STATS_COLUMNS.length);

  const columns = STATS_COLUMNS.map((col) => ({
    ...col,
    width: col.minWidth + extraPerColumn,
  }));

  const tableWidth =
    nameWidth + columns.reduce((sum, col) => sum + col.width, 0);

  return { nameWidth, columns, tableWidth };
}

function renderStatsHeader(layout: StatsLayout, theme: Theme): string {
  const parts: string[] = [];

  // Name column
  parts.push(padRight("Provider/Model", layout.nameWidth));

  // Data columns
  for (const col of layout.columns) {
    const label = padLeft(col.label, col.width);
    parts.push(col.dimmed ? theme.fg("dim", label) : label);
  }

  return parts.join("");
}

function renderStatsRow(
  layout: StatsLayout,
  name: string,
  stats: RowStats,
  theme?: Theme,
  selected = false,
  dimmed = false,
): string {
  const parts: string[] = [];
  const t = theme ?? { fg: (_c: string, s: string) => s };

  // Name column (truncated)
  const displayName =
    visibleWidth(name) > layout.nameWidth
      ? `${name.slice(0, Math.max(0, layout.nameWidth - 3))}...`
      : name;
  const nameStr = padRight(displayName, layout.nameWidth);
  parts.push(
    selected
      ? t.fg("accent", nameStr)
      : dimmed
        ? t.fg("dim", nameStr)
        : nameStr,
  );

  // Data columns
  for (const col of layout.columns) {
    const value = padLeft(col.getValue(stats), col.width);
    const displayValue = col.dimmed || dimmed ? t.fg("dim", value) : value;
    parts.push(displayValue);
  }

  return parts.join("");
}

function padRight(str: string, width: number): string {
  const len = visibleWidth(str);
  if (len >= width) return str;
  return str + " ".repeat(width - len);
}

function padLeft(str: string, width: number): string {
  const len = visibleWidth(str);
  if (len >= width) return str;
  return " ".repeat(width - len) + str;
}

// === Main component ===

interface PanelTab {
  label: string;
  buildContent: (width: number, theme: Theme) => string[];
  onInput?: (key: string) => boolean;
}

class ProvidersUsagePanel implements Component {
  private activeTab = 0;
  private scrollOffset = 0;
  private cachedLines: string[] | null = null;
  private cachedWidth = 0;
  private onClose: () => void;
  private data: UsageData;
  private activeProvider: string | undefined;
  private theme: Theme;

  // State for stats tabs
  private statsState: Record<Exclude<TabName, "session">, StatsViewState> = {
    today: { selectedProviderIndex: 0, expandedProviders: new Set() },
    thisWeek: { selectedProviderIndex: 0, expandedProviders: new Set() },
    allTime: { selectedProviderIndex: 0, expandedProviders: new Set() },
  };

  constructor(
    _tui: TUI,
    theme: Theme,
    data: UsageData,
    activeProvider: string | undefined,
    onClose: () => void,
  ) {
    this.theme = theme;
    this.onClose = onClose;
    this.data = data;
    this.activeProvider = activeProvider;
  }

  private getTabs(): PanelTab[] {
    return [
      {
        label: TAB_LABELS.session,
        buildContent: (width, theme) =>
          buildSessionTabContent(width, theme, this.data, this.activeProvider),
      },
      {
        label: TAB_LABELS.today,
        buildContent: (width, theme) =>
          buildStatsTabContent(
            "today",
            width,
            theme,
            this.data.stats.today,
            this.statsState.today,
          ),
        onInput: (key) => this.handleStatsInput("today", key),
      },
      {
        label: TAB_LABELS.thisWeek,
        buildContent: (width, theme) =>
          buildStatsTabContent(
            "thisWeek",
            width,
            theme,
            this.data.stats.thisWeek,
            this.statsState.thisWeek,
          ),
        onInput: (key) => this.handleStatsInput("thisWeek", key),
      },
      {
        label: TAB_LABELS.allTime,
        buildContent: (width, theme) =>
          buildStatsTabContent(
            "allTime",
            width,
            theme,
            this.data.stats.allTime,
            this.statsState.allTime,
          ),
        onInput: (key) => this.handleStatsInput("allTime", key),
      },
    ];
  }

  private handleStatsInput(
    tab: Exclude<TabName, "session">,
    key: string,
  ): boolean {
    const state = this.statsState[tab];
    const stats = this.data.stats[tab];
    const providers = Array.from(stats.providers.entries()).sort(
      (a, b) => b[1].cost - a[1].cost,
    );

    if (key === "Enter" || key === " ") {
      const [providerName] = providers[state.selectedProviderIndex] ?? [""];
      if (providerName) {
        if (state.expandedProviders.has(providerName)) {
          state.expandedProviders.delete(providerName);
        } else {
          state.expandedProviders.add(providerName);
        }
        this.invalidate();
        return true;
      }
    }

    if (key === "j" || key === "ArrowDown") {
      const maxIndex = providers.length - 1;
      if (state.selectedProviderIndex < maxIndex) {
        state.selectedProviderIndex++;
        this.invalidate();
      }
      return true;
    }

    if (key === "k" || key === "ArrowUp") {
      if (state.selectedProviderIndex > 0) {
        state.selectedProviderIndex--;
        this.invalidate();
      }
      return true;
    }

    return false;
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

    // Let current tab handle input first
    const currentTab = tabs[this.activeTab];
    if (currentTab?.onInput?.(data)) {
      return true;
    }

    // Default scroll handling
    const maxVisible = 20;
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

    const maxVisible = 20;
    const totalLines = this.cachedLines.length;
    const lines: string[] = [];

    // Border top
    const borderChar = "─";
    lines.push(theme.fg("border", borderChar.repeat(width)));

    // Title
    lines.push(
      truncateToWidthSafe(
        ` ${theme.fg("accent", theme.bold("Provider Usage"))}`,
        width,
        theme,
      ),
    );

    // Tab bar
    lines.push(this.renderTabBar(width, theme, tabs));
    lines.push("");

    // Scroll indicator (top)
    if (this.scrollOffset > 0) {
      lines.push(
        truncateToWidthSafe(
          theme.fg("dim", `  ↑ ${this.scrollOffset} lines above`),
          width,
          theme,
        ),
      );
    } else {
      lines.push("");
    }

    // Content
    const end = Math.min(this.scrollOffset + maxVisible, totalLines);
    for (let i = this.scrollOffset; i < end; i++) {
      lines.push(
        truncateToWidthSafe(`  ${this.cachedLines[i] ?? ""}`, width, theme),
      );
    }

    // Fill empty lines
    const shown = end - this.scrollOffset;
    for (let i = shown; i < maxVisible; i++) {
      lines.push("");
    }

    // Scroll indicator (bottom)
    const remaining = totalLines - this.scrollOffset - maxVisible;
    if (remaining > 0) {
      lines.push(
        truncateToWidthSafe(
          theme.fg("dim", `  ↓ ${remaining} lines below`),
          width,
          theme,
        ),
      );
    } else {
      lines.push("");
    }

    // Footer
    lines.push("");
    const footer = this.renderFooter(width, tabs, remaining > 0);
    lines.push(truncateToWidthSafe(footer, width, theme));

    // Border bottom
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
        parts.push(theme.fg("borderMuted", "│"));
      }
    }

    return truncateToWidthSafe(`  ${parts.join("")}`, width, theme);
  }

  private renderFooter(
    width: number,
    tabs: PanelTab[],
    canScroll: boolean,
  ): string {
    const currentTab = tabs[this.activeTab];
    const hasExpand = currentTab?.onInput !== undefined;

    let left = "Tab/←/→ switch";
    if (canScroll) left += "  j/k scroll";
    if (hasExpand) left += "  Enter expand";

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
): Promise<UsageData> {
  const [rateLimits, stats] = await Promise.all([
    fetchAllProviderRateLimits(authStorage, signal),
    collectSessionStats(signal),
  ]);
  return { rateLimits, stats };
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

      const result = await cmdCtx.ui.custom((tui, theme, _kb, done) => {
        // Show loader while fetching data
        const loader = new BorderedLoader(tui, theme, "Loading usage...");
        loader.onAbort = () => done(undefined);

        let panel: ProvidersUsagePanel | null = null;

        loadUsageData(loader.signal, authStorage)
          .then((data) => {
            if (loader.signal.aborted) return;
            panel = new ProvidersUsagePanel(
              tui,
              theme,
              data,
              activeProvider,
              () => done(undefined),
            );
            tui.requestRender();
          })
          .catch(() => {
            if (loader.signal.aborted) return;
            // Show empty data on error
            const emptyData: UsageData = {
              rateLimits: [],
              stats: {
                today: emptyStats(),
                thisWeek: emptyStats(),
                allTime: emptyStats(),
              },
            };
            panel = new ProvidersUsagePanel(
              tui,
              theme,
              emptyData,
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

      // RPC fallback
      if (result === undefined) {
        cmdCtx.ui.notify("/providers:usage requires interactive mode", "info");
      }
    },
  });
}

function emptyStats(): TimeFilteredStats {
  return {
    providers: new Map(),
    totals: {
      sessions: 0,
      messages: 0,
      cost: 0,
      tokens: { total: 0, input: 0, output: 0, cache: 0 },
    },
  };
}
