/**
 * TUI utilities for consistent box rendering across extensions.
 *
 * Provides helpers for creating bordered boxes with theme support.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Component, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

// ============================================================================
// TYPES
// ============================================================================

export type BorderFn = (s: string) => string;

export type BoxOptions = {
  /** Add leading space before left border (default: false) */
  leadingSpace?: boolean;
  /** Add trailing space after right border (default: false) */
  trailingSpace?: boolean;
};

export type BoxRenderer = {
  /** Top border: ╭────────╮ */
  top: () => string;
  /** Top border with centered title: ╭─── Title ───╮ */
  topWithTitle: (title: string, titleFn?: (s: string) => string) => string;
  /** Bottom border: ╰────────╯ */
  bottom: () => string;
  /** Section divider: ├────────┤ */
  divider: () => string;
  /** Content row with left-aligned padding: │ content     │ */
  row: (content: string) => string;
  /** Content row with centered content: │   content   │ */
  centeredRow: (content: string) => string;
  /** Empty row: │            │ */
  empty: () => string;
  /** Pad a line to full width (for terminal rendering) */
  padLine: (line: string) => string;
  /** Inner width available for content */
  innerWidth: number;
  /** Total width of the box */
  width: number;
};

// ============================================================================
// BOX RENDERER
// ============================================================================

/**
 * Create a box renderer for consistent bordered boxes.
 *
 * @param width - Total width of the box
 * @param borderFn - Function to style border characters
 * @param options - Box rendering options
 * @returns Box renderer with helper methods
 *
 * @example
 * ```typescript
 * const border = (s: string) => theme.fg("border", s);
 * const box = createBoxRenderer(width, border);
 *
 * return [
 *   box.topWithTitle("My Title", s => theme.fg("accent", theme.bold(s))),
 *   box.empty(),
 *   box.row("Some content here"),
 *   box.divider(),
 *   box.row("More content"),
 *   box.bottom(),
 * ];
 * ```
 */
export function createBoxRenderer(
  width: number,
  borderFn: BorderFn,
  options: BoxOptions = {},
): BoxRenderer {
  const { leadingSpace = false, trailingSpace = false } = options;

  // Calculate how much space is used by borders and padding
  // Row structure: prefix + "│" + " " + content + "│" + suffix
  // Base (no options): "│" + " " + content + "│" = 3 + content
  // With leadingSpace: " │" + " " + content + "│" = 4 + content
  // With trailingSpace: "│" + " " + content + "│ " = 4 + content
  // With both: " │" + " " + content + "│ " = 5 + content
  const extraChars = (leadingSpace ? 1 : 0) + (trailingSpace ? 1 : 0);
  const innerWidth = Math.max(0, width - 3 - extraChars);
  const prefix = leadingSpace ? " " : "";
  const suffix = trailingSpace ? " " : "";
  // borderWidth is the number of dashes between corners (excludes corner chars)
  const borderWidth = width - 2 - extraChars;

  const pad = (s: string, w: number): string => {
    const vis = visibleWidth(s);
    return s + " ".repeat(Math.max(0, w - vis));
  };

  const padLine = (line: string): string => {
    const visLen = visibleWidth(line);
    return line + " ".repeat(Math.max(0, width - visLen));
  };

  return {
    innerWidth,
    width,
    padLine,

    top: () =>
      borderFn(`${prefix}╭${"─".repeat(Math.max(0, borderWidth))}╮${suffix}`),

    topWithTitle: (title: string, titleFn?: (s: string) => string): string => {
      const styledTitle = titleFn ? ` ${titleFn(title)} ` : ` ${title} `;
      const titleLen = visibleWidth(styledTitle);
      const dashesTotal = Math.max(0, borderWidth - titleLen);
      const leftDashes = Math.floor(dashesTotal / 2);
      const rightDashes = dashesTotal - leftDashes;
      return (
        borderFn(`${prefix}╭${"─".repeat(leftDashes)}`) +
        styledTitle +
        borderFn(`${"─".repeat(rightDashes)}╮${suffix}`)
      );
    },

    bottom: () =>
      borderFn(`${prefix}╰${"─".repeat(Math.max(0, borderWidth))}╯${suffix}`),

    divider: () =>
      borderFn(`${prefix}├${"─".repeat(Math.max(0, borderWidth))}┤${suffix}`),

    row: (content: string): string =>
      `${borderFn(`${prefix}│`)} ${pad(content, innerWidth)}${borderFn(`│${suffix}`)}`,

    centeredRow: (content: string): string => {
      const contentLen = visibleWidth(content);
      // Include the margin space (1 char) in centering calculation
      const availableSpace = innerWidth + 1;
      const totalPadding = Math.max(0, availableSpace - contentLen);
      const leftPad = Math.floor(totalPadding / 2);
      const rightPad = totalPadding - leftPad;
      return (
        borderFn(`${prefix}│`) +
        " ".repeat(leftPad) +
        content +
        " ".repeat(rightPad) +
        borderFn(`│${suffix}`)
      );
    },

    empty: (): string =>
      `${borderFn(`${prefix}│`)} ${" ".repeat(innerWidth)}${borderFn(`│${suffix}`)}`,
  };
}

// ============================================================================
// THEME-BASED BOX RENDERER
// ============================================================================

/**
 * Create a box renderer using theme.fg("border", ...) for styling.
 *
 * @param width - Total width of the box
 * @param theme - Pi theme object
 * @param options - Box rendering options
 * @returns Box renderer with theme-based border styling
 *
 * @example
 * ```typescript
 * const box = createThemedBoxRenderer(width, theme);
 *
 * return [
 *   box.topWithTitle("Usage", s => theme.fg("accent", theme.bold(s))),
 *   box.row(theme.fg("dim", "Loading...")),
 *   box.bottom(),
 * ];
 * ```
 */
export function createThemedBoxRenderer(
  width: number,
  theme: Theme,
  options: BoxOptions = {},
): BoxRenderer {
  return createBoxRenderer(width, (s) => theme.fg("border", s), options);
}

// ============================================================================
// DIM BOX RENDERER
// ============================================================================

const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;

/**
 * Create a box renderer using dim ANSI styling for borders.
 *
 * @param width - Total width of the box
 * @param options - Box rendering options
 * @returns Box renderer with dim border styling
 *
 * @example
 * ```typescript
 * const box = createDimBoxRenderer(width);
 *
 * return [
 *   box.topWithTitle("Processes", s => bold(cyan(s))),
 *   box.row("Process list..."),
 *   box.bottom(),
 * ];
 * ```
 */
export function createDimBoxRenderer(
  width: number,
  options: BoxOptions = {},
): BoxRenderer {
  return createBoxRenderer(width, dim, options);
}

// ============================================================================
// CENTERED LOADER
// ============================================================================

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export type CenteredLoaderOptions = {
  /** Width of the loader box (default: 40) */
  boxWidth?: number;
};

/**
 * A centered loader component with solid background.
 *
 * Shows a spinner with message, centered on screen with a solid background.
 * Press Escape to abort.
 *
 * @example
 * ```typescript
 * const loader = new CenteredLoader(tui, theme, "Loading data...");
 * loader.onAbort = () => done(null);
 * loader.start();
 *
 * fetchData(loader.signal)
 *   .then(data => { loader.stop(); done(data); })
 *   .catch(() => done(null));
 *
 * return loader;
 * ```
 */
export class CenteredLoader implements Component {
  private tui: { requestRender: () => void };
  private theme: Theme;
  private message: string;
  private boxWidth: number;
  private spinnerIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController;

  /** Callback when user aborts (Escape) */
  onAbort?: () => void;

  /** Whether the loader was aborted */
  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  /** Abort signal for async operations */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    message: string,
    options: CenteredLoaderOptions = {},
  ) {
    this.tui = tui;
    this.theme = theme;
    this.message = message;
    this.boxWidth = options.boxWidth ?? 40;
    this.abortController = new AbortController();
  }

  /** Start the spinner animation */
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
      this.tui.requestRender();
    }, 80);
  }

  /** Stop the spinner animation */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.abortController.abort();
      this.stop();
      this.onAbort?.();
    }
  }

  render(width: number): string[] {
    const boxW = Math.min(this.boxWidth, width - 4);
    const innerW = boxW - 4;

    // Background color function
    const bg = (s: string) => this.theme.bg("toolPendingBg", s);
    const border = (s: string) => this.theme.fg("border", s);
    const accent = (s: string) => this.theme.fg("accent", s);
    const dimText = (s: string) => this.theme.fg("dim", s);

    const spinner = SPINNER_FRAMES[this.spinnerIndex] ?? SPINNER_FRAMES[0];
    const spinnerLine = `${accent(spinner ?? "⠋")} ${this.message}`;
    const hintLine = dimText("Press Escape to cancel");

    // Create box lines with background
    const topBorder = border(`╭${"─".repeat(boxW - 2)}╮`);
    const bottomBorder = border(`╰${"─".repeat(boxW - 2)}╯`);

    const createRow = (content: string): string => {
      const contentLen = visibleWidth(content);
      const padding = Math.max(0, innerW - contentLen);
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return (
        border("│") +
        bg(" ".repeat(leftPad + 1) + content + " ".repeat(rightPad + 1)) +
        border("│")
      );
    };

    const emptyRow = (): string => {
      return border("│") + bg(" ".repeat(innerW + 2)) + border("│");
    };

    // Build the box
    const boxLines: string[] = [];
    boxLines.push(topBorder);
    boxLines.push(emptyRow());
    boxLines.push(createRow(spinnerLine));
    boxLines.push(emptyRow());
    boxLines.push(createRow(hintLine));
    boxLines.push(emptyRow());
    boxLines.push(bottomBorder);

    // Center horizontally
    const leftOffset = Math.floor((width - boxW) / 2);
    const centeredBoxLines = boxLines.map(
      (line) => " ".repeat(leftOffset) + line,
    );

    // Add vertical padding (approximate center for typical terminal ~24-30 rows)
    // Box is 7 lines, so add ~8-10 empty lines above to center vertically
    const verticalPadding = 8;
    const result: string[] = [];
    for (let i = 0; i < verticalPadding; i++) {
      result.push("");
    }
    result.push(...centeredBoxLines);

    return result;
  }

  invalidate(): void {}

  dispose(): void {
    this.stop();
  }
}
