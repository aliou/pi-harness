import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { DUMB_ZONE_MESSAGE, OVERLAY_COOLDOWN_MS } from "./constants";

// ============================================================================
// STATE
// ============================================================================

let overlayActive = false;
let lastOverlayTime = 0;

// ============================================================================
// COOLDOWN MANAGEMENT
// ============================================================================

/**
 * Check if enough time has passed since last overlay.
 */
export function shouldShowOverlay(): boolean {
  if (overlayActive) return false;

  const now = Date.now();
  if (now - lastOverlayTime < OVERLAY_COOLDOWN_MS) {
    return false;
  }

  return true;
}

/**
 * Reset cooldown timer (for testing).
 */
export function resetCooldown(): void {
  lastOverlayTime = 0;
  overlayActive = false;
}

// ============================================================================
// OVERLAY DISPLAY
// ============================================================================

/**
 * Trigger dumb zone overlay display.
 */
export function triggerDumbZoneOverlay(
  ctx: ExtensionContext,
  details: string,
): void {
  if (!ctx.hasUI) return;
  if (!shouldShowOverlay()) return;

  lastOverlayTime = Date.now();
  void showDumbZoneOverlay(ctx, details);
}

/**
 * Show the dumb zone overlay.
 */
async function showDumbZoneOverlay(
  ctx: ExtensionContext,
  details: string,
): Promise<void> {
  if (overlayActive) return;
  overlayActive = true;

  try {
    await ctx.ui.custom<void>(
      (_tui, theme, _keybindings, done) => {
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          done(undefined);
        };

        return new DumbZoneOverlay(theme, details, close);
      },
      {
        overlay: true,
        overlayOptions: {
          width: "60%",
          minWidth: 40,
          maxHeight: 7,
          anchor: "center",
        },
      },
    );
  } finally {
    overlayActive = false;
  }
}

// ============================================================================
// OVERLAY COMPONENT
// ============================================================================

class DumbZoneOverlay {
  constructor(
    private readonly theme: Theme,
    private readonly details: string,
    private readonly onClose: () => void,
  ) {}

  handleInput(_data: string): void {
    this.onClose();
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const border = this.theme.fg("border", "│");
    const top = this.theme.fg("border", `┌${"─".repeat(innerWidth)}┐`);
    const bottom = this.theme.fg("border", `└${"─".repeat(innerWidth)}┘`);

    // Title line
    const title = truncateToWidth(DUMB_ZONE_MESSAGE, innerWidth, "");
    const styledTitle = this.theme.fg("error", this.theme.bold(title));
    const titleWidth = visibleWidth(title);
    const titlePadding = Math.max(0, innerWidth - titleWidth);
    const titleLeftPad = Math.floor(titlePadding / 2);
    const titleRightPad = titlePadding - titleLeftPad;
    const titleLine = `${border}${" ".repeat(titleLeftPad)}${styledTitle}${" ".repeat(titleRightPad)}${border}`;

    // Empty line
    const emptyLine = `${border}${" ".repeat(innerWidth)}${border}`;

    // Details line
    const detailsText = truncateToWidth(this.details, innerWidth, "");
    const styledDetails = this.theme.fg("warning", detailsText);
    const detailsWidth = visibleWidth(detailsText);
    const detailsPadding = Math.max(0, innerWidth - detailsWidth);
    const detailsLeftPad = Math.floor(detailsPadding / 2);
    const detailsRightPad = detailsPadding - detailsLeftPad;
    const detailsLine = `${border}${" ".repeat(detailsLeftPad)}${styledDetails}${" ".repeat(detailsRightPad)}${border}`;

    return [top, titleLine, emptyLine, detailsLine, emptyLine, bottom];
  }

  invalidate(): void {}
}
