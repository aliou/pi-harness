/**
 * Footer component with 2-line layout.
 *
 * Line 1: Path (left) + Stats (right aligned)
 * Line 2: Session name (left) + Model (right aligned)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { buildModelIdLine, buildModelLine } from "../lib/model";
import { buildPathParts } from "../lib/path-parts";
import {
  buildMinimalStatsParts,
  buildStatsParts,
  getContextUsage,
  getCumulativeUsage,
} from "../lib/stats";
import { getTPS, setupTPSTracking } from "../lib/tps";

/**
 * Create a footer component with 2-line layout.
 */
export function createCustomFooter(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  setupTPSTracking(pi);

  const renderFooter = (
    width: number,
    theme: Theme,
    footer_data: ReadonlyFooterDataProvider,
  ): string[] => {
    if (!ctx) return [];

    const branch = footer_data.getGitBranch();
    const sessionName = ctx.sessionManager.getSessionName();

    // Calculate cumulative usage and context
    const usage = getCumulativeUsage(ctx);
    const contextUsage = getContextUsage(ctx);
    const tpsStr = getTPS();

    // Build left side: path + branch
    const { parts, width: leftWidth } = buildPathParts(theme, branch);

    // Build stats (line 1 right side)
    const statsParts = buildStatsParts(theme, usage, contextUsage, tpsStr);
    const statsLine = statsParts.join(" ");
    const statsWidth = visibleWidth(statsLine);
    const minPadding = 4;

    // Line 1: Path + Stats
    const paddingWidth1 = width - leftWidth - statsWidth;
    const padding1 =
      paddingWidth1 > 0
        ? theme.fg("thinkingMinimal", " ".repeat(Math.max(0, paddingWidth1)))
        : "";
    let line1 =
      parts.join("") + padding1 + theme.fg("thinkingMinimal", statsLine);

    const line1Width = visibleWidth(line1);
    let useMinimal = false;

    if (line1Width > width) {
      // If line 1 doesn't fit, use minimal layout for small screens
      useMinimal = true;

      // Rebuild with minimal layout: project name + branch only on line 1
      const { parts: minimalParts } = buildPathParts(
        theme,
        branch,
        true, // minimal mode
      );
      line1 = minimalParts.join("");
    }

    // Line 2: Context + Price + Model ID (if minimal) or Session name + Model (if normal)
    let line2: string;
    if (useMinimal) {
      // Small screen: Show context used + price + model ID only
      const minimalStatsParts = buildMinimalStatsParts(
        theme,
        usage,
        contextUsage,
      );
      const modelIdLine = buildModelIdLine(
        theme,
        ctx.model?.id,
        ctx,
        ctx.model?.provider,
      );

      const leftWidth2 = minimalStatsParts.reduce(
        (sum, part) => sum + visibleWidth(part),
        0,
      );
      const modelIdWidth = visibleWidth(modelIdLine);

      const paddingWidth2 = width - leftWidth2 - modelIdWidth;
      const padding2 =
        paddingWidth2 > 0
          ? theme.fg("thinkingMinimal", " ".repeat(Math.max(0, paddingWidth2)))
          : "";

      line2 = minimalStatsParts.join("") + padding2 + modelIdLine;

      if (visibleWidth(line2) > width) {
        line2 = truncateToWidth(modelIdLine, width, "...");
      }
    } else {
      // Normal layout
      const left_parts2: string[] = [sessionName ?? ""].filter(Boolean);
      const left_parts2_colored = left_parts2.map((s) =>
        theme.fg("thinkingMinimal", s),
      );
      const leftWidth2 = left_parts2.reduce(
        (sum, part) => sum + visibleWidth(part),
        0,
      );

      // Build model (line 2 right side)
      const thinkingLevel = pi.getThinkingLevel();
      const modelLine = buildModelLine(
        theme,
        ctx,
        ctx.model?.provider,
        ctx.model?.id,
        !!ctx.model?.reasoning,
        thinkingLevel ?? "off",
      );
      const modelWidth = visibleWidth(modelLine);

      const paddingWidth2 = width - leftWidth2 - modelWidth;
      const padding2 =
        paddingWidth2 > 0
          ? theme.fg("thinkingMinimal", " ".repeat(Math.max(0, paddingWidth2)))
          : "";
      line2 = left_parts2_colored.join("") + padding2 + modelLine;

      const line2Width = visibleWidth(line2);
      if (line2Width > width) {
        const availableLeft2 = Math.max(0, width - (modelWidth + minPadding));
        if (availableLeft2 > 0) {
          const truncatedLeft2 = truncateToWidth(
            sessionName ?? "",
            availableLeft2,
            "",
          );
          const truncatedLeft2Colored = theme.fg(
            "thinkingMinimal",
            truncatedLeft2,
          );
          const newPadding2 = theme.fg(
            "thinkingMinimal",
            " ".repeat(
              Math.max(0, width - visibleWidth(truncatedLeft2) - modelWidth),
            ),
          );
          line2 = truncatedLeft2Colored + newPadding2 + modelLine;
        } else {
          line2 = truncateToWidth(modelLine, width, "...");
        }
      }
    }

    return [line1, line2];
  };

  return {
    setup: (context: ExtensionContext) => {
      ctx = context;

      ctx.ui.setFooter((tui, theme, footerData) => {
        const unsub = footerData.onBranchChange(() => {
          tui.requestRender?.();
        });

        return {
          dispose: unsub,
          invalidate() {},
          render(width: number): string[] {
            return renderFooter(width, theme, footerData);
          },
        };
      });
    },
    cleanup: () => {
      if (ctx) {
        ctx.ui.setFooter(undefined);
        ctx = undefined;
      }
    },
  };
}
