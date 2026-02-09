import type { AssistantMessage, Usage } from "@mariozechner/pi-ai";
import type {
  ContextUsage,
  ExtensionAPI,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { renderInfoBoxLines } from "../components/info-box";
import { TextViewer } from "../components/text-viewer";

// ---------------------------------------------------------------------------
// Token formatting (matches footer style)
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Aggregate usage from session entries
// ---------------------------------------------------------------------------

interface AggregatedUsage {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  turnCount: number;
}

function aggregateUsage(
  entries: Array<{ type: string; message?: unknown }>,
): AggregatedUsage {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;
  let turnCount = 0;

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message as AssistantMessage | undefined;
    if (!msg || msg.role !== "assistant" || !msg.usage) continue;

    totalInput += msg.usage.input;
    totalOutput += msg.usage.output;
    totalCacheRead += msg.usage.cacheRead;
    totalCacheWrite += msg.usage.cacheWrite;
    totalCost += msg.usage.cost.total;
    turnCount++;
  }

  return {
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    totalCost,
    turnCount,
  };
}

function getLastAssistantUsage(
  entries: Array<{ type: string; message?: unknown }>,
): Usage | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    if (entry.type !== "message") continue;
    const msg = entry.message as AssistantMessage | undefined;
    if (
      msg?.role === "assistant" &&
      msg.stopReason !== "aborted" &&
      msg.usage
    ) {
      return msg.usage;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Segmented progress bar
// ---------------------------------------------------------------------------

interface BarSegment {
  tokens: number;
  char: string;
  color: "accent" | "warning" | "dim" | "borderMuted";
  label: string;
}

function renderSegmentedBar(
  lastUsage: Usage | undefined,
  contextWindow: number,
  percent: number,
  width: number,
  theme: Theme,
): string[] {
  const barWidth = Math.max(20, width - 10);

  if (!lastUsage || contextWindow === 0) {
    // No breakdown available, render a simple bar.
    const filledWidth = Math.round((percent / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const barColor =
      percent > 90 ? "error" : percent > 70 ? "warning" : "accent";
    const bar =
      theme.fg(barColor, "\u2588".repeat(filledWidth)) +
      theme.fg("dim", " ".repeat(emptyWidth));
    return [`${bar} ${theme.fg(barColor, `${percent.toFixed(1)}%`)}`];
  }

  const segments: BarSegment[] = [
    {
      tokens: lastUsage.cacheRead,
      char: "\u2588",
      color: "accent",
      label: "cache read",
    },
    {
      tokens: lastUsage.cacheWrite,
      char: "\u2593",
      color: "warning",
      label: "cache write",
    },
    {
      tokens: lastUsage.input,
      char: "\u2592",
      color: "borderMuted",
      label: "input",
    },
    { tokens: lastUsage.output, char: "\u2591", color: "dim", label: "output" },
  ];

  const total = segments.reduce((s, seg) => s + seg.tokens, 0);
  const lines: string[] = [];

  // Render bar
  let barStr = "";
  const segWidths: number[] = [];
  let allocated = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    let segWidth: number;
    if (i === segments.length - 1) {
      // Last segment gets the remainder to avoid rounding gaps.
      const totalFilled = Math.round((total / contextWindow) * barWidth);
      segWidth = Math.max(0, totalFilled - allocated);
    } else {
      segWidth = Math.round((seg.tokens / contextWindow) * barWidth);
    }
    // Ensure segments with tokens get at least 1 char.
    if (seg.tokens > 0 && segWidth === 0) segWidth = 1;
    segWidths.push(segWidth);
    allocated += segWidth;
    barStr += theme.fg(seg.color, seg.char.repeat(segWidth));
  }

  const emptyWidth = Math.max(0, barWidth - allocated);
  barStr += " ".repeat(emptyWidth);

  const barColor = percent > 90 ? "error" : percent > 70 ? "warning" : "accent";
  lines.push(`${barStr} ${theme.fg(barColor, `${percent.toFixed(1)}%`)}`);

  // Render legend line aligned under the bar.
  const legendParts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (seg.tokens === 0) continue;
    legendParts.push(
      theme.fg(seg.color, seg.char) +
        theme.fg("dim", ` ${seg.label} (${formatTokens(seg.tokens)})`),
    );
  }
  lines.push(legendParts.join(theme.fg("dim", "  ")));

  return lines;
}

// ---------------------------------------------------------------------------
// Content builder
// ---------------------------------------------------------------------------

function buildContent(
  contextUsage: ContextUsage | undefined,
  lastUsage: Usage | undefined,
  usage: AggregatedUsage,
  contextWindow: number,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  // Segmented context window bar
  const percent = contextUsage?.percent ?? 0;
  lines.push(
    ...renderSegmentedBar(lastUsage, contextWindow, percent, width, theme),
  );
  lines.push("");

  // Context details
  const contextLines: string[] = [];
  if (contextUsage) {
    contextLines.push(
      `${theme.fg("dim", "Tokens:")}     ${formatTokens(contextUsage.tokens)} / ${formatTokens(contextWindow)}`,
    );
  }
  contextLines.push(`${theme.fg("dim", "Turns:")}      ${usage.turnCount}`);
  lines.push(...renderInfoBoxLines("Context", contextLines, width, theme));
  lines.push("");

  // Cumulative token usage
  const tokenLines: string[] = [];
  if (usage.totalInput > 0) {
    tokenLines.push(
      `${theme.fg("dim", "\u2191 Input:")}      ${formatTokens(usage.totalInput)}`,
    );
  }
  if (usage.totalOutput > 0) {
    tokenLines.push(
      `${theme.fg("dim", "\u2193 Output:")}     ${formatTokens(usage.totalOutput)}`,
    );
  }
  if (usage.totalCacheRead > 0) {
    tokenLines.push(
      `${theme.fg("dim", "R Cache Read:")}  ${formatTokens(usage.totalCacheRead)}`,
    );
  }
  if (usage.totalCacheWrite > 0) {
    tokenLines.push(
      `${theme.fg("dim", "W Cache Write:")} ${formatTokens(usage.totalCacheWrite)}`,
    );
  }
  if (tokenLines.length > 0) {
    lines.push(
      ...renderInfoBoxLines("Cumulative Tokens", tokenLines, width, theme),
    );
    lines.push("");
  }

  // Cost
  if (usage.totalCost > 0) {
    const costLines = [
      `${theme.fg("dim", "Total:")} $${usage.totalCost.toFixed(4)}`,
    ];
    lines.push(...renderInfoBoxLines("Cost", costLines, width, theme));
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("No usage data available yet.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerContextCommand(pi: ExtensionAPI) {
  pi.registerCommand("pi:context", {
    description: "View context usage and token statistics",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const contextUsage = ctx.getContextUsage();
      const entries = ctx.sessionManager.getEntries();
      const usage = aggregateUsage(entries);
      const lastUsage = getLastAssistantUsage(entries);
      const contextWindow = ctx.model?.contextWindow ?? 0;

      await ctx.ui.custom((tui, theme, _keybindings, done) => {
        return new TextViewer(
          "Context Usage",
          (width, t) =>
            buildContent(
              contextUsage,
              lastUsage,
              usage,
              contextWindow,
              width,
              t,
            ),
          tui,
          theme,
          () => done(undefined),
        );
      });
    },
  });
}
