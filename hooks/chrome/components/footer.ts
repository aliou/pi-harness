/**
 * Footer component with 2-line layout.
 *
 * Line 1: Path (left) + Stats (right aligned)
 * Line 2: Session name (left) + Model (right aligned)
 * Line 3: Extension statuses (only when an extension set one)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  AD_EDITOR_STASH_CHANGED_EVENT,
  type AdEditorStashChangedEvent,
} from "@harness/events";
import { buildStatusLine } from "../lib/extension-status";
import { GitStatusWatcher } from "../lib/git-status";
import {
  buildModelIdLine,
  buildModelLine,
  findRoutedModel,
  formatRoutedModel,
  isVirtualModel,
} from "../lib/model";
import { buildPathParts } from "../lib/path-parts";
import {
  buildMinimalStatsParts,
  buildStatsParts,
  getContextUsage,
  getCumulativeUsage,
} from "../lib/stats";

/**
 * Create a footer component with 2-line layout.
 */
export function createCustomFooter(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let requestRender: (() => void) | undefined;
  let gitStatusWatcher: GitStatusWatcher | undefined;
  let stashHasContent = false;

  pi.events.on(AD_EDITOR_STASH_CHANGED_EVENT, (data: unknown) => {
    const event = data as AdEditorStashChangedEvent;
    stashHasContent = event.hasContent;
    if (!ctx) return;
    requestRender?.();
  });

  const renderFooter = (
    width: number,
    theme: Theme,
    footer_data: ReadonlyFooterDataProvider,
  ): string[] => {
    if (!ctx) return [];

    const branch = footer_data.getGitBranch();
    const sessionName = ctx.sessionManager.getSessionName();

    // An alias has no limits of its own. Until it answers after being
    // selected, Pi reports the window of the previous model, so hide it.
    const routed = findRoutedModel(ctx.model, ctx.sessionManager.getBranch());
    const awaitingRoute = isVirtualModel(ctx.model) && !routed;

    const usage = getCumulativeUsage(ctx);
    const contextUsage = getContextUsage(ctx, !awaitingRoute);

    const gitStatus = gitStatusWatcher?.getStatus();
    const pathData = buildPathParts(theme, branch, gitStatus, stashHasContent);

    const statsParts = buildStatsParts(theme, usage, contextUsage);
    const statsLine = statsParts.join(" ");
    const statsWidth = visibleWidth(statsLine);
    const minPadding = 2;

    // Build line 1 with progressive degradation:
    // 1. Full: path + branch + stats
    // 2. Drop branch
    // 3. Truncate path
    let line1: string;
    let useMinimal = false;

    const buildLine1 = (
      leftStr: string,
      leftWidth: number,
      rightStr: string,
      rightWidth: number,
    ): string => {
      const pad = Math.max(0, width - leftWidth - rightWidth);
      return (
        leftStr +
        theme.fg("thinkingMinimal", " ".repeat(pad)) +
        theme.fg("thinkingMinimal", rightStr)
      );
    };

    // Full left side: path + branch
    const fullLeft =
      pathData.path + (pathData.branch ? ` ${pathData.branch}` : "");
    const fullLeftWidth = pathData.width;

    if (fullLeftWidth + minPadding + statsWidth <= width) {
      // Everything fits
      line1 = buildLine1(fullLeft, fullLeftWidth, statsLine, statsWidth);
    } else {
      // Drop branch, keep path + stats
      const noBranchLeft = pathData.path;
      const noBranchLeftWidth = pathData.pathWidth;

      if (noBranchLeftWidth + minPadding + statsWidth <= width) {
        line1 = buildLine1(
          noBranchLeft,
          noBranchLeftWidth,
          statsLine,
          statsWidth,
        );
      } else {
        // Drop stats too, switch to minimal mode
        useMinimal = true;
        const minimalStatsParts = buildMinimalStatsParts(
          theme,
          usage,
          contextUsage,
        );
        let minimalStatsLine = minimalStatsParts.join(" ");
        let minimalStatsWidth = visibleWidth(minimalStatsLine);

        // Defensive: if minimal stats still exceed the terminal width (e.g.
        // the context-window string is long on a very narrow terminal),
        // truncate hard rather than emit an over-wide line — pi's TUI throws
        // on any rendered line wider than the viewport.
        if (minimalStatsWidth > width) {
          minimalStatsLine = truncateToWidth(minimalStatsLine, width, "");
          minimalStatsWidth = visibleWidth(minimalStatsLine);
        }

        const availForPath = Math.max(
          0,
          width - minPadding - minimalStatsWidth,
        );
        const truncPath = truncateToWidth(pathData.path, availForPath, "...");
        const truncPathWidth = visibleWidth(truncPath);
        const truncLeft = truncPath;
        const truncLeftWidth = truncPathWidth;

        line1 = buildLine1(
          truncLeft,
          truncLeftWidth,
          minimalStatsLine,
          minimalStatsWidth,
        );
      }
    }

    const routedModelId =
      routed && formatRoutedModel(routed, ctx.modelRegistry.getAvailable());

    let line2: string;
    if (useMinimal) {
      const modelIdLine = buildModelIdLine(
        theme,
        routedModelId ?? ctx.model?.id,
      );
      line2 = truncateToWidth(modelIdLine, width, "...");
    } else {
      const left_parts2: string[] = [sessionName ?? ""].filter(Boolean);
      const left_parts2_colored = left_parts2.map((s) =>
        theme.fg("thinkingMinimal", s),
      );
      const leftWidth2 = left_parts2.reduce(
        (sum, part) => sum + visibleWidth(part),
        0,
      );

      const thinkingLevel = pi.getThinkingLevel();
      const hasReasoning = !!ctx.model?.reasoning;
      const modelLine = buildModelLine(
        theme,
        ctx.model?.provider,
        ctx.model?.id,
        hasReasoning,
        thinkingLevel ?? "off",
        routedModelId,
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

    // Extension statuses set via ctx.ui.setStatus(). The built-in footer
    // renders these on their own line; a custom footer must too, or they
    // are silently dropped.
    const statusLine = buildStatusLine(footer_data.getExtensionStatuses());
    if (statusLine === undefined) return [line1, line2];

    return [
      truncateToWidth(statusLine, width, theme.fg("thinkingMinimal", "...")),
      line1,
      line2,
    ];
  };

  return {
    setup: (context: ExtensionContext) => {
      ctx = context;
      ctx.ui.setFooter((tui, theme, footerData) => {
        requestRender = () => tui.requestRender?.();

        gitStatusWatcher?.dispose();
        gitStatusWatcher = new GitStatusWatcher(process.cwd(), () => {
          requestRender?.();
        });

        const unsub = footerData.onBranchChange(() => {
          requestRender?.();
        });

        return {
          dispose: () => {
            requestRender = undefined;
            gitStatusWatcher?.dispose();
            gitStatusWatcher = undefined;
            unsub();
          },
          invalidate() {},
          render(width: number): string[] {
            return renderFooter(width, theme, footerData);
          },
        };
      });
    },
    /** Re-render after state the TUI does not watch, such as a model switch. */
    refresh: () => requestRender?.(),
    cleanup: () => {
      if (ctx) {
        ctx.ui.setFooter(undefined);
        ctx = undefined;
      }
    },
  };
}
