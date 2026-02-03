import type {
  ExtensionAPI,
  Theme,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
  getContextUtilization,
  getEffectiveThreshold,
  hasCompacted,
} from "../checks";
import { CONTEXT_THRESHOLDS } from "../constants";

// ============================================================================
// STATUS OVERLAY COMPONENT
// ============================================================================

interface StatusData {
  utilization: number;
  warningThreshold: number;
  dangerThreshold: number;
  criticalThreshold: number;
  compacted: boolean;
}

class DumbZoneStatusOverlay {
  constructor(
    private readonly theme: Theme,
    private readonly data: StatusData,
    private readonly onClose: () => void,
  ) {}

  handleInput(_data: string): void {
    this.onClose();
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const top = this.theme.fg("border", `┌${"─".repeat(innerWidth)}┐`);
    const bottom = this.theme.fg("border", `└${"─".repeat(innerWidth)}┘`);

    const lines: string[] = [top];

    // Title
    lines.push(this.renderTitleLine("DUMB ZONE STATUS", innerWidth));

    // Empty line
    lines.push(this.emptyLine(innerWidth));

    // Progress bar
    lines.push(this.renderProgressBar(innerWidth));

    // Empty line
    lines.push(this.emptyLine(innerWidth));

    // Current utilization
    const utilizationText = `Context: ${this.data.utilization.toFixed(1)}%`;
    const utilizationColor = this.getUtilizationColor();
    lines.push(this.centerLine(utilizationText, innerWidth, utilizationColor));

    // Thresholds info
    const thresholdsText = `Warning: ${this.data.warningThreshold.toFixed(0)}% | Danger: ${this.data.dangerThreshold.toFixed(0)}% | Critical: ${this.data.criticalThreshold.toFixed(0)}%`;
    lines.push(this.centerLine(thresholdsText, innerWidth, "muted"));

    // Compaction status
    if (this.data.compacted) {
      lines.push(this.emptyLine(innerWidth));
      lines.push(
        this.centerLine("(post-compaction thresholds)", innerWidth, "warning"),
      );
    }

    // Empty line
    lines.push(this.emptyLine(innerWidth));

    // Dismiss hint
    lines.push(
      this.centerLine("Press any key to dismiss", innerWidth, "muted"),
    );

    lines.push(bottom);
    return lines;
  }

  private renderProgressBar(innerWidth: number): string {
    const border = this.theme.fg("border", "│");
    const barWidth = Math.max(10, innerWidth - 4); // 2 padding each side

    const {
      utilization,
      warningThreshold,
      dangerThreshold,
      criticalThreshold,
    } = this.data;

    // Build the bar character by character
    let bar = "";
    for (let i = 0; i < barWidth; i++) {
      const pct = (i / barWidth) * 100;

      // Determine if this position is filled
      const filled = pct < utilization;

      // Determine color based on threshold zones
      let color: ThemeColor;
      if (pct >= criticalThreshold) {
        color = "error";
      } else if (pct >= dangerThreshold) {
        color = "error";
      } else if (pct >= warningThreshold) {
        color = "warning";
      } else {
        color = "success";
      }

      if (filled) {
        bar += this.theme.fg(color, "█");
      } else {
        bar += this.theme.fg("muted", "░");
      }
    }

    const padding = Math.max(0, innerWidth - barWidth);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;

    return `${border}${" ".repeat(leftPad)}${bar}${" ".repeat(rightPad)}${border}`;
  }

  private getUtilizationColor(): ThemeColor {
    const {
      utilization,
      warningThreshold,
      dangerThreshold,
      criticalThreshold,
    } = this.data;

    if (utilization >= criticalThreshold) return "error";
    if (utilization >= dangerThreshold) return "error";
    if (utilization >= warningThreshold) return "warning";
    return "success";
  }

  private renderTitleLine(text: string, innerWidth: number): string {
    const border = this.theme.fg("border", "│");
    const truncated = truncateToWidth(text, innerWidth, "");
    const styled = this.theme.fg("accent", this.theme.bold(truncated));

    const textWidth = visibleWidth(truncated);
    const padding = Math.max(0, innerWidth - textWidth);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;

    return `${border}${" ".repeat(leftPad)}${styled}${" ".repeat(rightPad)}${border}`;
  }

  private centerLine(
    text: string,
    innerWidth: number,
    color: ThemeColor,
  ): string {
    const border = this.theme.fg("border", "│");
    const truncated = truncateToWidth(text, innerWidth, "");
    const styled = this.theme.fg(color, truncated);

    const textWidth = visibleWidth(truncated);
    const padding = Math.max(0, innerWidth - textWidth);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;

    return `${border}${" ".repeat(leftPad)}${styled}${" ".repeat(rightPad)}${border}`;
  }

  private emptyLine(innerWidth: number): string {
    const border = this.theme.fg("border", "│");
    return `${border}${" ".repeat(innerWidth)}${border}`;
  }

  invalidate(): void {}
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

export function setupDumbZoneCommands(pi: ExtensionAPI): void {
  pi.registerCommand("dumb-zone-status", {
    description: "Show current dumb zone proximity status",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const utilization = getContextUtilization(ctx);
      const compacted = hasCompacted(ctx);

      const data: StatusData = {
        utilization,
        warningThreshold: getEffectiveThreshold(
          CONTEXT_THRESHOLDS.WARNING,
          compacted,
        ),
        dangerThreshold: getEffectiveThreshold(
          CONTEXT_THRESHOLDS.DANGER,
          compacted,
        ),
        criticalThreshold: getEffectiveThreshold(
          CONTEXT_THRESHOLDS.CRITICAL,
          compacted,
        ),
        compacted,
      };

      const result = await ctx.ui.custom<void>(
        (_tui, theme, _keybindings, done) => {
          return new DumbZoneStatusOverlay(theme, data, () => done(undefined));
        },
        {
          overlay: true,
          overlayOptions: {
            width: "60%",
            minWidth: 50,
            maxHeight: 12,
            anchor: "center",
          },
        },
      );

      // RPC fallback
      if (result === undefined) {
        const pct = Math.round(data.utilization * 100);
        const zone =
          data.utilization >= data.criticalThreshold
            ? "CRITICAL"
            : data.utilization >= data.dangerThreshold
              ? "DANGER"
              : data.utilization >= data.warningThreshold
                ? "WARNING"
                : "OK";
        ctx.ui.notify(`Context: ${pct}% (${zone})`, "info");
      }
    },
  });
}
