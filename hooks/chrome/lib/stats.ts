import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { formatTokens } from "./utils";

// Context usage thresholds for color coding
export const CONTEXT_WARNING_THRESHOLD = 35;
export const CONTEXT_ERROR_THRESHOLD = 50;

/**
 * Reference context window used to calibrate footer context-pressure colors.
 *
 * When a model's real context window exceeds this, only the warning/error color
 * thresholds are computed against this reference rather than the full window.
 * The displayed percentage and denominator still use the real model window.
 * This keeps the color signal firing at the same absolute token counts
 * regardless of how large the model's context window is (e.g. a 1M-context
 * Gemini model still turns warning at ~95k and error at ~136k) without making
 * the footer look like the model itself is capped.
 */
export const REFERENCE_CONTEXT_WINDOW = 272_000;

interface CumulativeUsage {
  totalCost: number;
  branchCost: number;
}

interface ContextUsage {
  window: number;
  percent: number;
  colorPercent: number;
  display: string;
}

/**
 * Calculate cumulative cost from session entries.
 */
export function getCumulativeUsage(ctx: ExtensionContext): CumulativeUsage {
  let totalCost = 0;
  let branchCost = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      totalCost += entry.message.usage.cost.total;
    }
  }

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      branchCost += entry.message.usage.cost.total;
    }
  }

  return {
    totalCost,
    branchCost,
  };
}

/**
 * Get context usage from session. Pass `windowKnown: false` when the window Pi
 * reports belongs to another model, such as an alias that has not answered
 * since it was selected; the window then shows as `?`.
 */
export function getContextUsage(
  ctx: ExtensionContext,
  windowKnown = true,
): ContextUsage | undefined {
  const contextUsage = ctx.getContextUsage();
  if (!contextUsage) return undefined;

  const reportedWindow =
    contextUsage.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const rawWindow = windowKnown ? reportedWindow : 0;
  const colorWindow =
    rawWindow > REFERENCE_CONTEXT_WINDOW ? REFERENCE_CONTEXT_WINDOW : rawWindow;

  const tokens = contextUsage.tokens;
  const known = tokens !== null && rawWindow > 0;
  const colorKnown = tokens !== null && colorWindow > 0;
  const contextPercentValue = known ? (tokens / rawWindow) * 100 : 0;
  const colorPercentValue = colorKnown ? (tokens / colorWindow) * 100 : 0;
  const contextPercent = known ? contextPercentValue.toFixed(1) : "?";
  const tokensDisplay = tokens !== null ? formatTokens(tokens) : "?";
  const windowDisplay = rawWindow > 0 ? formatTokens(rawWindow) : "?";

  return {
    window: rawWindow,
    percent: contextPercentValue,
    colorPercent: colorPercentValue,
    display: `${contextPercent}${known ? "%" : ""} ${tokensDisplay}/${windowDisplay}`,
  };
}

/**
 * Build stats parts for footer line 1 right side.
 */
export function buildStatsParts(
  theme: Theme,
  usage: CumulativeUsage,
  contextUsage: ContextUsage | undefined,
): string[] {
  const costStr =
    Math.abs(usage.branchCost - usage.totalCost) < 0.0005
      ? usage.branchCost === 0
        ? "$0"
        : `$${usage.branchCost.toFixed(3)}`
      : `$${usage.branchCost.toFixed(3)} ($${usage.totalCost.toFixed(3)})`;

  const stats = [costStr, contextUsage?.display].filter(Boolean).join(" ");
  if (!contextUsage) return [stats];

  if (contextUsage.colorPercent > CONTEXT_ERROR_THRESHOLD) {
    return [theme.fg("error", stats)];
  }

  if (contextUsage.colorPercent > CONTEXT_WARNING_THRESHOLD) {
    return [theme.fg("warning", stats)];
  }

  return [stats];
}

/**
 * Build minimal stats for small screens.
 *
 * Drops the tps readout and the cumulative-cost parenthetical, keeping only
 * the branch cost and context-usage line. Used when the full stats line cannot
 * fit alongside the path, so the footer never emits a line wider than the
 * terminal (which would crash pi's TUI render loop).
 *
 * Color wrapping mirrors buildStatsParts so context-pressure warnings still
 * fire in minimal mode.
 */
export function buildMinimalStatsParts(
  theme: Theme,
  usage: CumulativeUsage,
  contextUsage: ContextUsage | undefined,
): string[] {
  const costStr = `$${usage.branchCost.toFixed(3)}`;
  const stats = [costStr, contextUsage?.display].filter(Boolean).join(" ");
  if (!contextUsage) return [stats];

  if (contextUsage.colorPercent > CONTEXT_ERROR_THRESHOLD) {
    return [theme.fg("error", stats)];
  }

  if (contextUsage.colorPercent > CONTEXT_WARNING_THRESHOLD) {
    return [theme.fg("warning", stats)];
  }

  return [stats];
}
