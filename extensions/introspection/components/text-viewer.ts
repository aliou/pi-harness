import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

type ContentBuilder = (width: number, theme: Theme) => string[];

export class TextViewer implements Component {
  private scrollOffset = 0;
  private maxVisible = 20;
  private cachedLines: string[] | null = null;
  private cachedWidth = 0;
  private pendingG = false;
  private border: DynamicBorder;

  constructor(
    private title: string,
    private buildContent: ContentBuilder,
    private tui: TUI,
    private theme: Theme,
    private onClose: () => void,
  ) {
    this.border = new DynamicBorder((s: string) => theme.fg("border", s));
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return true;
    }

    const totalLines = this.cachedLines?.length ?? 0;
    const maxScroll = Math.max(0, totalLines - this.maxVisible);

    if (data === "j" || matchesKey(data, "down")) {
      if (this.scrollOffset < maxScroll) {
        this.scrollOffset++;
        this.tui.requestRender();
      }
      return true;
    }

    if (data === "k" || matchesKey(data, "up")) {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
        this.tui.requestRender();
      }
      return true;
    }

    if (data === " " || matchesKey(data, "pageDown")) {
      this.scrollOffset = Math.min(
        this.scrollOffset + this.maxVisible,
        maxScroll,
      );
      this.tui.requestRender();
      return true;
    }

    if (matchesKey(data, "pageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - this.maxVisible);
      this.tui.requestRender();
      return true;
    }

    // gg -> top (vim style)
    if (data === "g") {
      if (this.pendingG) {
        this.pendingG = false;
        this.scrollOffset = 0;
        this.tui.requestRender();
        return true;
      }
      this.pendingG = true;
      setTimeout(() => {
        this.pendingG = false;
      }, 500);
      return true;
    }

    // G -> bottom (vim style)
    if (data === "G") {
      this.pendingG = false;
      this.scrollOffset = maxScroll;
      this.tui.requestRender();
      return true;
    }

    // Clear pending g on any other key
    this.pendingG = false;

    if (matchesKey(data, "home")) {
      this.scrollOffset = 0;
      this.tui.requestRender();
      return true;
    }

    if (matchesKey(data, "end")) {
      this.scrollOffset = maxScroll;
      this.tui.requestRender();
      return true;
    }

    return false;
  }

  invalidate(): void {
    this.cachedLines = null;
    this.cachedWidth = 0;
  }

  render(width: number): string[] {
    // Build content lines (with padding accounted for).
    const contentWidth = Math.max(1, width - 2);
    if (!this.cachedLines || this.cachedWidth !== width) {
      this.cachedLines = this.buildContent(contentWidth, this.theme);
      this.cachedWidth = width;
    }

    const lines = this.cachedLines;
    const totalLines = lines.length;
    const result: string[] = [];

    // Top border.
    result.push(...this.border.render(width));

    // Title.
    result.push(
      truncateToWidth(
        ` ${this.theme.fg("accent", this.theme.bold(this.title))}`,
        width,
      ),
    );
    result.push("");

    if (this.scrollOffset > 0) {
      result.push(
        truncateToWidth(
          this.theme.fg("dim", `  ↑ ${this.scrollOffset} lines above`),
          width,
        ),
      );
    } else {
      result.push("");
    }

    // Visible content lines.
    const end = Math.min(this.scrollOffset + this.maxVisible, totalLines);
    for (let i = this.scrollOffset; i < end; i++) {
      result.push(truncateToWidth(`  ${lines[i] ?? ""}`, width));
    }

    // Pad to maxVisible so the layout doesn't jump.
    const displayed = end - this.scrollOffset;
    for (let i = displayed; i < this.maxVisible; i++) {
      result.push("");
    }

    const remaining = totalLines - this.scrollOffset - this.maxVisible;
    if (remaining > 0) {
      result.push(
        truncateToWidth(
          this.theme.fg("dim", `  ↓ ${remaining} lines below`),
          width,
        ),
      );
    } else {
      result.push("");
    }

    // Help line.
    result.push("");
    result.push(
      truncateToWidth(
        this.theme.fg(
          "dim",
          "  j/k scroll  PgUp/PgDn page  gg/G top/bottom  q/Esc close",
        ),
        width,
      ),
    );

    // Bottom border.
    result.push(...this.border.render(width));

    return result;
  }
}
