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
} from "@mariozechner/pi-tui";
import { collectSessionStats } from "../collectors/session-stats";
import { fetchAllProviderRateLimits } from "../rate-limits";
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
  padLeft,
  padRight,
} from "../utils";

const TAB_ORDER: TabName[] = ["session", "today", "thisWeek", "allTime"];
const TAB_LABELS: Record<TabName, string> = {
  session: "Session",
  today: "Today",
  thisWeek: "Week",
  allTime: "All Time",
};

const MIN_NAME_WIDTH = 16;
const MIN_COLUMN_WIDTH = 4;
const STATS_COLUMNS = [
  {
    label: "Sessions",
    minWidth: 8,
    getValue: (s: RowStats) => formatNumber(s.sessions),
  },
  {
    label: "Msgs",
    minWidth: 6,
    getValue: (s: RowStats) => formatNumber(s.messages),
  },
  { label: "Cost", minWidth: 8, getValue: (s: RowStats) => formatCost(s.cost) },
  {
    label: "Tokens",
    minWidth: 8,
    getValue: (s: RowStats) => formatTokens(s.tokens.total),
  },
  {
    label: "↑In",
    minWidth: 6,
    dimmed: true,
    getValue: (s: RowStats) => formatTokens(s.tokens.input),
  },
  {
    label: "↓Out",
    minWidth: 6,
    dimmed: true,
    getValue: (s: RowStats) => formatTokens(s.tokens.output),
  },
  {
    label: "Cache",
    minWidth: 6,
    dimmed: true,
    getValue: (s: RowStats) => formatTokens(s.tokens.cache),
  },
];

type RowStats = {
  sessions: number;
  messages: number;
  cost: number;
  tokens: { total: number; input: number; output: number; cache: number };
};

type StatsColumn = (typeof STATS_COLUMNS)[number] & { width: number };

type StatsLayout = {
  nameWidth: number;
  columns: StatsColumn[];
  tableWidth: number;
};

type AnsiTheme = {
  dim: (s: string) => string;
  bold: (s: string) => string;
  accent: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  red: (s: string) => string;
  cyan: (s: string) => string;
  border: (s: string) => string;
};

type Rgb = { r: number; g: number; b: number };

const ANSI_16_COLORS: Rgb[] = [
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 0, b: 0 },
  { r: 0, g: 128, b: 0 },
  { r: 128, g: 128, b: 0 },
  { r: 0, g: 0, b: 128 },
  { r: 128, g: 0, b: 128 },
  { r: 0, g: 128, b: 128 },
  { r: 192, g: 192, b: 192 },
  { r: 128, g: 128, b: 128 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
];

const ANSI_CUBE = [0, 95, 135, 175, 215, 255];

function rgbFrom256(index: number): Rgb {
  if (index < 16)
    return ANSI_16_COLORS[index] ?? ANSI_16_COLORS[0] ?? { r: 0, g: 0, b: 0 };
  if (index >= 232) {
    const gray = 8 + (index - 232) * 10;
    return { r: gray, g: gray, b: gray };
  }
  const idx = index - 16;
  const r = Math.floor(idx / 36);
  const g = Math.floor((idx % 36) / 6);
  const b = idx % 6;
  return { r: ANSI_CUBE[r] ?? 0, g: ANSI_CUBE[g] ?? 0, b: ANSI_CUBE[b] ?? 0 };
}

function parseAnsiColor(ansi: string): Rgb | null {
  const trueColorPrefixes = ["\u001b[38;2;", "\u001b[48;2;"];
  for (const prefix of trueColorPrefixes) {
    const start = ansi.indexOf(prefix);
    if (start === -1) continue;
    const payloadStart = start + prefix.length;
    const end = ansi.indexOf("m", payloadStart);
    if (end === -1) continue;
    const parts = ansi.slice(payloadStart, end).split(";");
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return { r, g, b };
      }
    }
  }

  const indexedPrefixes = ["\u001b[38;5;", "\u001b[48;5;"];
  for (const prefix of indexedPrefixes) {
    const start = ansi.indexOf(prefix);
    if (start === -1) continue;
    const payloadStart = start + prefix.length;
    const end = ansi.indexOf("m", payloadStart);
    if (end === -1) continue;
    const value = Number(ansi.slice(payloadStart, end));
    if (!Number.isNaN(value)) {
      return rgbFrom256(value);
    }
  }

  return null;
}

function isLightTheme(theme: Theme): boolean {
  try {
    const bgAnsi = theme.getBgAnsi("userMessageBg");
    const rgb = parseAnsiColor(bgAnsi);
    if (!rgb) return false;
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.6;
  } catch {
    return false;
  }
}

function createAnsiTheme(theme: Theme): AnsiTheme {
  const light = isLightTheme(theme);
  const colors = light
    ? {
        accent: "\x1b[34m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        red: "\x1b[31m",
        cyan: "\x1b[36m",
      }
    : {
        accent: "\x1b[96m",
        green: "\x1b[92m",
        yellow: "\x1b[93m",
        red: "\x1b[91m",
        cyan: "\x1b[96m",
      };
  const color = (code: string) => (s: string) => `${code}${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
  return {
    dim,
    bold,
    accent: color(colors.accent),
    green: color(colors.green),
    yellow: color(colors.yellow),
    red: color(colors.red),
    cyan: color(colors.cyan),
    border: (s: string) => theme.fg("dim", s),
  };
}

const MIN_PACE_PERCENT = 5;

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

function getProjectedPercent(
  usedPercent: number,
  pacePercent?: number | null,
): number {
  if (pacePercent === null || pacePercent === undefined) return usedPercent;
  const effectivePace = Math.max(MIN_PACE_PERCENT, pacePercent);
  return Math.max(0, (usedPercent / effectivePace) * 100);
}

function getDurationUnitMs(totalMs: number): {
  label: "d" | "h" | "m";
  ms: number;
} {
  if (totalMs >= 24 * 60 * 60 * 1000) {
    return { label: "d", ms: 24 * 60 * 60 * 1000 };
  }
  if (totalMs >= 60 * 60 * 1000) {
    return { label: "h", ms: 60 * 60 * 1000 };
  }
  return { label: "m", ms: 60 * 1000 };
}

function formatDurationDecimalMs(
  durationMs: number,
  unit: { label: "d" | "h" | "m"; ms: number },
): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return `0${unit.label}`;
  }
  const value = durationMs / unit.ms;
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1);
  return `${text}${unit.label}`;
}

function formatDurationPairMs(elapsedMs: number, totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return "??/??";
  const unit = getDurationUnitMs(totalMs);
  const elapsedText = formatDurationDecimalMs(elapsedMs, unit);
  const totalText = formatDurationDecimalMs(totalMs, unit);
  return `${elapsedText}/${totalText}`;
}

function getWindowProgressText(window: RateLimitWindow): string {
  const windowSeconds =
    window.windowSeconds ?? inferWindowSeconds(window.label);
  if (!windowSeconds || !window.resetsAt) return "??/??";
  const totalMs = windowSeconds * 1000;
  const remainingMs = window.resetsAt.getTime() - Date.now();
  const elapsedMs = Math.min(totalMs, Math.max(0, totalMs - remainingMs));
  return formatDurationPairMs(elapsedMs, totalMs);
}

function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getPeriodProgress(
  tab: TabName,
): { label: string; percent: number; progressText: string } | null {
  const now = new Date();

  if (tab === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = now.getTime() - start.getTime();
    const percent = (elapsedMs / totalMs) * 100;
    return {
      label: "Today",
      percent: Math.max(0, Math.min(100, percent)),
      progressText: formatDurationPairMs(elapsedMs, totalMs),
    };
  }

  if (tab === "thisWeek") {
    const start = getStartOfWeek(now);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = now.getTime() - start.getTime();
    const percent = (elapsedMs / totalMs) * 100;
    return {
      label: "Week",
      percent: Math.max(0, Math.min(100, percent)),
      progressText: formatDurationPairMs(elapsedMs, totalMs),
    };
  }

  return null;
}

class UsageComponent implements Component {
  private activeTab: TabName = "session";
  private data: UsageData;
  private colors: AnsiTheme;
  private requestRender: () => void;
  private done: () => void;
  private scrollOffset = 0;
  private lastContentLines = 0;
  private lastAvailableLines = 0;

  constructor(
    colors: AnsiTheme,
    data: UsageData,
    requestRender: () => void,
    done: () => void,
  ) {
    this.colors = colors;
    this.data = data;
    this.requestRender = requestRender;
    this.done = done;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || data === "q" || data === "Q") {
      this.done();
      return;
    }

    if (matchesKey(data, "tab") || matchesKey(data, "right")) {
      const idx = TAB_ORDER.indexOf(this.activeTab);
      const nextIndex = (idx + 1 + TAB_ORDER.length) % TAB_ORDER.length;
      const nextTab = TAB_ORDER[nextIndex] ?? TAB_ORDER[0] ?? this.activeTab;
      this.activeTab = nextTab;
      this.scrollOffset = 0;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
      const idx = TAB_ORDER.indexOf(this.activeTab);
      const prevIndex = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      const prevTab = TAB_ORDER[prevIndex] ?? TAB_ORDER[0] ?? this.activeTab;
      this.activeTab = prevTab;
      this.scrollOffset = 0;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "down") || data === "j") {
      const maxOffset = Math.max(
        0,
        this.lastContentLines - this.lastAvailableLines,
      );
      if (this.scrollOffset < maxOffset) {
        this.scrollOffset += 1;
        this.requestRender();
      }
      return;
    }

    if (matchesKey(data, "up") || data === "k") {
      if (this.scrollOffset > 0) {
        this.scrollOffset -= 1;
        this.requestRender();
      }
    }
  }

  render(width: number): string[] {
    const colors = this.colors;
    const lines: string[] = [];
    const innerWidth = width - 2; // 1 char padding each side

    // Helper to pad line
    const padLine = (content: string): string => {
      const len = visibleWidth(content);
      return ` ${content}${" ".repeat(Math.max(0, innerWidth - len))} `;
    };

    // Top border with title
    const title = " Usage ";
    const titleLen = title.length;
    const borderLen = Math.max(0, width - titleLen);
    const leftBorder = Math.floor(borderLen / 2);
    const rightBorder = borderLen - leftBorder;
    lines.push(
      colors.border("─".repeat(leftBorder)) +
        colors.accent(colors.bold(title)) +
        colors.border("─".repeat(rightBorder)),
    );

    lines.push(padLine(""));
    lines.push(padLine(this.renderTabs()));
    lines.push(padLine(""));

    const contentLines =
      this.activeTab === "session"
        ? this.renderSessionTab(innerWidth)
        : this.renderStatsTab(this.getStatsForTab(this.activeTab), innerWidth);

    // Fixed height to keep UI compact (matches original overlay size)
    const FIXED_HEIGHT = 24;
    const headerLines = 4; // title + empty + tabs + empty
    const footerLines = 2; // divider + footer
    const availableLines = Math.max(
      3,
      FIXED_HEIGHT - headerLines - footerLines,
    );

    this.lastContentLines = contentLines.length;
    this.lastAvailableLines = availableLines;
    const maxOffset = Math.max(0, contentLines.length - availableLines);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);

    const visibleLines = contentLines.slice(
      this.scrollOffset,
      this.scrollOffset + availableLines,
    );

    for (const line of visibleLines) {
      lines.push(padLine(line));
    }

    let renderedLines = visibleLines.length;
    while (renderedLines < availableLines) {
      lines.push(padLine(""));
      renderedLines++;
    }

    const canScroll = contentLines.length > availableLines;
    lines.push(colors.border("─".repeat(width)));
    lines.push(padLine(this.renderFooter(innerWidth, canScroll)));

    // Bottom border
    lines.push(colors.border("─".repeat(width)));

    return lines;
  }

  invalidate(): void {
    // no-op
  }

  dispose(): void {
    // no-op
  }

  private renderTabs(): string {
    return TAB_ORDER.map((tab) => {
      const label = TAB_LABELS[tab];
      if (tab === this.activeTab) {
        return this.colors.accent(`[${label}]`);
      }
      return this.colors.dim(` ${label} `);
    }).join("  ");
  }

  private renderFooter(width: number, canScroll: boolean): string {
    const left = canScroll
      ? `${this.colors.dim("Tab/←/→")} switch  ${this.colors.dim("↑/↓")} scroll`
      : `${this.colors.dim("Tab/←/→")} switch`;
    const right = `${this.colors.dim("q")} close`;
    const gap = Math.max(2, width - visibleWidth(left) - visibleWidth(right));
    return left + " ".repeat(gap) + right;
  }

  private renderSessionTab(width: number): string[] {
    const lines: string[] = [];
    const timezone = getLocalTimezone();
    const sep = this.colors.dim("─".repeat(Math.max(0, width)));

    for (const provider of this.data.rateLimits) {
      lines.push(this.renderProviderHeader(provider, width));
      lines.push(sep);

      if (provider.error) {
        lines.push(this.colors.red(provider.error));
        lines.push("");
        continue;
      }

      if (!provider.windows.length) {
        lines.push(this.colors.dim("No rate limit data"));
        lines.push("");
        continue;
      }

      for (const window of provider.windows) {
        const pacePercent = getPacePercent(window);
        const progressText = getWindowProgressText(window);
        lines.push(`${window.label} (${progressText})`);
        lines.push(
          this.renderProgressBar(window.usedPercent, width, pacePercent),
        );
        lines.push(`Resets ${formatResetTime(window.resetsAt, timezone)}`);
        lines.push("");
      }
    }

    if (lines.length === 0) {
      return [this.colors.dim("No providers configured")];
    }

    return lines;
  }

  private renderProviderHeader(
    provider: ProviderRateLimits,
    width: number,
  ): string {
    const status = this.renderStatus(provider);
    const statusWidth = visibleWidth(status);
    const leftWidth = Math.max(0, width - statusWidth);
    const left = padRight(provider.provider, leftWidth);
    return `${left}${status}`;
  }

  private renderStatus(provider: ProviderRateLimits): string {
    switch (provider.status) {
      case "operational":
        return this.colors.green("● Operational");
      case "degraded":
        return this.colors.yellow("● Degraded");
      case "outage":
        return this.colors.red("● Outage");
      default:
        return this.colors.dim("○ Unknown");
    }
  }

  private renderProgressBar(
    usedPercent: number,
    width: number,
    pacePercent?: number | null,
    colorMode: "usage" | "neutral" = "usage",
  ): string {
    const clamped = Math.max(0, Math.min(100, Math.round(usedPercent)));
    const label = `${clamped}%`;
    const labelWidth = visibleWidth(label);
    const barWidth = Math.max(10, width - labelWidth - 1);
    const filled = Math.round((clamped / 100) * barWidth);
    const markerIndex =
      pacePercent === null || pacePercent === undefined
        ? null
        : Math.max(
            0,
            Math.min(
              barWidth - 1,
              Math.round((pacePercent / 100) * (barWidth - 1)),
            ),
          );

    let fillColor: keyof AnsiTheme = "accent";
    if (colorMode === "usage") {
      const projected = getProjectedPercent(clamped, pacePercent);
      fillColor = "green";
      if (projected >= 90) fillColor = "red";
      else if (projected >= 80) fillColor = "yellow";
    }

    const parts: string[] = [];
    for (let idx = 0; idx < barWidth; idx += 1) {
      if (markerIndex === idx) {
        parts.push(this.colors.cyan("│"));
        continue;
      }
      if (idx < filled) {
        parts.push(this.colors[fillColor]("━"));
      } else {
        parts.push(this.colors.dim("─"));
      }
    }

    const coloredLabel = this.colors[fillColor](label);
    return `${parts.join("")} ${coloredLabel}`;
  }

  private renderStatsTab(stats: TimeFilteredStats, width: number): string[] {
    const layout = this.buildStatsLayout(width);
    const lines: string[] = [];

    const period = getPeriodProgress(this.activeTab);
    if (period) {
      lines.push(`${period.label} (${period.progressText})`);
      lines.push(
        this.renderProgressBar(
          period.percent,
          width,
          period.percent,
          "neutral",
        ),
      );
      lines.push("");
    }

    if (stats.providers.size === 0) {
      lines.push(this.colors.dim("No usage data for this period"));
      return lines;
    }

    lines.push(this.renderStatsHeader(layout));
    lines.push(this.colors.dim("─".repeat(layout.tableWidth)));

    const providers = Array.from(stats.providers.entries()).sort(
      (a, b) => b[1].cost - a[1].cost,
    );

    for (const [providerName, providerStats] of providers) {
      const providerRow = this.renderStatsRow(layout, providerName, {
        sessions: providerStats.sessions.size,
        messages: providerStats.messages,
        cost: providerStats.cost,
        tokens: providerStats.tokens,
      });
      lines.push(providerRow);

      const models = Array.from(providerStats.models.entries()).sort(
        (a, b) => b[1].cost - a[1].cost,
      );

      for (const [modelName, modelStats] of models) {
        const modelRow = this.renderStatsRow(layout, `  ${modelName}`, {
          sessions: modelStats.sessions.size,
          messages: modelStats.messages,
          cost: modelStats.cost,
          tokens: modelStats.tokens,
        });
        lines.push(this.colors.dim(modelRow));
      }
    }

    lines.push(this.colors.dim("─".repeat(layout.tableWidth)));
    lines.push(
      this.renderStatsRow(layout, "Totals", {
        sessions: stats.totals.sessions,
        messages: stats.totals.messages,
        cost: stats.totals.cost,
        tokens: stats.totals.tokens,
      }),
    );

    return lines;
  }

  private buildStatsLayout(width: number): StatsLayout {
    const columns: StatsColumn[] = STATS_COLUMNS.map((col) => ({
      ...col,
      width: col.minWidth,
    }));
    const columnsMin = columns.reduce((sum, col) => sum + col.width, 0);
    let nameWidth = Math.max(MIN_NAME_WIDTH, width - columnsMin);

    if (nameWidth < MIN_NAME_WIDTH) {
      let deficit = MIN_NAME_WIDTH - nameWidth;
      for (let i = columns.length - 1; i >= 0 && deficit > 0; i--) {
        const col = columns[i];
        if (!col) continue;
        const reducible = Math.max(0, col.width - MIN_COLUMN_WIDTH);
        const reduction = Math.min(deficit, reducible);
        col.width -= reduction;
        deficit -= reduction;
      }
      nameWidth = Math.max(
        MIN_NAME_WIDTH,
        width - columns.reduce((sum, col) => sum + col.width, 0),
      );
    }

    const tableWidth =
      nameWidth + columns.reduce((sum, col) => sum + col.width, 0);
    return { nameWidth, columns, tableWidth };
  }

  private renderStatsHeader(layout: StatsLayout): string {
    let header = padRight(
      this.truncateText("Provider/Model", layout.nameWidth),
      layout.nameWidth,
    );
    for (const column of layout.columns) {
      const label = padLeft(
        this.truncateText(column.label, column.width),
        column.width,
      );
      header += column.dimmed ? this.colors.dim(label) : label;
    }
    return this.colors.dim(padRight(header, layout.tableWidth));
  }

  private renderStatsRow(
    layout: StatsLayout,
    name: string,
    stats: RowStats,
  ): string {
    let row = padRight(
      this.truncateText(name, layout.nameWidth),
      layout.nameWidth,
    );
    for (const column of layout.columns) {
      const value = padLeft(column.getValue(stats), column.width);
      row += column.dimmed ? this.colors.dim(value) : value;
    }
    return padRight(row, layout.tableWidth);
  }

  private truncateText(value: string, maxWidth: number): string {
    if (visibleWidth(value) <= maxWidth) return value;
    if (maxWidth <= 1) return value.slice(0, maxWidth);
    return `${value.slice(0, Math.max(0, maxWidth - 1))}…`;
  }

  private getStatsForTab(tab: TabName): TimeFilteredStats {
    switch (tab) {
      case "today":
        return this.data.stats.today;
      case "thisWeek":
        return this.data.stats.thisWeek;
      case "allTime":
        return this.data.stats.allTime;
      default:
        return this.data.stats.allTime;
    }
  }
}

class UsageContainer implements Component {
  private loader: BorderedLoader;
  private component: UsageComponent | null = null;
  private colors: AnsiTheme;

  constructor(
    tui: TUI,
    theme: Theme,
    dataLoader: (signal: AbortSignal) => Promise<UsageData>,
    done: () => void,
  ) {
    this.colors = createAnsiTheme(theme);
    this.loader = new BorderedLoader(tui, theme, "Loading usage...");
    this.loader.onAbort = () => done();

    dataLoader(this.loader.signal)
      .then((data) => {
        if (this.loader.signal.aborted) return;
        this.component = new UsageComponent(
          this.colors,
          data,
          () => tui.requestRender(),
          done,
        );
        tui.requestRender();
      })
      .catch(() => {
        if (this.loader.signal.aborted) return;
        this.component = new UsageComponent(
          this.colors,
          {
            rateLimits: [],
            stats: {
              today: emptyStats(),
              thisWeek: emptyStats(),
              allTime: emptyStats(),
            },
          },
          () => tui.requestRender(),
          done,
        );
        tui.requestRender();
      });
  }

  handleInput(data: string): void {
    if (this.component) {
      this.component.handleInput(data);
      return;
    }
    this.loader.handleInput(data);
  }

  render(width: number): string[] {
    if (this.component) return this.component.render(width);
    return this.loader.render(width);
  }

  invalidate(): void {
    this.component?.invalidate();
  }

  dispose(): void {
    this.component?.dispose();
    this.loader.dispose();
  }
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

export function setupUsageCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:usage", {
    description: "Show usage statistics dashboard",
    handler: async (_args, cmdCtx) => {
      if (!cmdCtx.hasUI) {
        cmdCtx.ui.notify("/providers:usage requires interactive mode", "error");
        return;
      }

      const authStorage = cmdCtx.modelRegistry.authStorage;
      const result = await cmdCtx.ui.custom((tui, theme, _kb, done) => {
        return new UsageContainer(
          tui,
          theme,
          (signal) => loadUsageData(signal, authStorage),
          () => done(undefined),
        );
      });

      // RPC fallback
      if (result === undefined) {
        cmdCtx.ui.notify("/providers:usage requires interactive mode", "info");
      }
    },
  });
}
