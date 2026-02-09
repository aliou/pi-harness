import type { Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

export interface Tab {
  label: string;
  /** Optional subtitle shown fixed below the tab bar (e.g. file path). */
  subtitle?: string;
  buildContent: (width: number, theme: Theme) => string[];
}

/**
 * A scrollable text viewer with navigable tabs.
 * Tab/Shift+Tab to switch tabs. j/k to scroll. gg/G for top/bottom.
 */
export class TabbedViewer implements Component {
  private activeTab = 0;
  private scrollOffset = 0;
  private maxVisible = 16;
  private cachedLines: string[] | null = null;
  private cachedWidth = 0;
  private pendingG = false;
  private border: DynamicBorder;

  constructor(
    private title: string,
    private tabs: Tab[],
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

    // Tab switching
    if (matchesKey(data, "tab")) {
      this.activeTab = (this.activeTab + 1) % this.tabs.length;
      this.scrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    if (matchesKey(data, "shift+tab")) {
      this.activeTab =
        (this.activeTab - 1 + this.tabs.length) % this.tabs.length;
      this.scrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return true;
    }

    const totalLines = this.cachedLines?.length ?? 0;
    const maxScroll = Math.max(0, totalLines - this.maxVisible);

    // Scrolling
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

    // gg -> top
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

    // G -> bottom
    if (data === "G") {
      this.pendingG = false;
      this.scrollOffset = maxScroll;
      this.tui.requestRender();
      return true;
    }

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
    const contentWidth = Math.max(1, width - 2);

    // Rebuild content if needed.
    if (!this.cachedLines || this.cachedWidth !== width) {
      const tab = this.tabs[this.activeTab];
      this.cachedLines = tab ? tab.buildContent(contentWidth, this.theme) : [];
      this.cachedWidth = width;
    }

    const lines = this.cachedLines;
    const totalLines = lines.length;
    const result: string[] = [];
    const tab = this.tabs[this.activeTab];

    // Top border.
    result.push(...this.border.render(width));

    // Title.
    result.push(
      truncateToWidth(
        ` ${this.theme.fg("accent", this.theme.bold(this.title))}`,
        width,
      ),
    );

    // Tab bar.
    result.push(this.renderTabBar(width));

    // Subtitle (e.g. file path) - fixed, does not scroll.
    // Always render the line to avoid layout jumps between tabs.
    if (tab?.subtitle) {
      result.push(
        truncateToWidth(`  ${this.theme.fg("dim", tab.subtitle)}`, width),
      );
    } else {
      result.push("");
    }

    result.push("");

    // Scroll-up indicator.
    if (this.scrollOffset > 0) {
      result.push(
        truncateToWidth(
          this.theme.fg("dim", `  \u2191 ${this.scrollOffset} lines above`),
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

    // Pad to maxVisible.
    const displayed = end - this.scrollOffset;
    for (let i = displayed; i < this.maxVisible; i++) {
      result.push("");
    }

    // Scroll-down indicator.
    const remaining = totalLines - this.scrollOffset - this.maxVisible;
    if (remaining > 0) {
      result.push(
        truncateToWidth(
          this.theme.fg("dim", `  \u2193 ${remaining} lines below`),
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
          "  Tab/S-Tab switch  j/k scroll  gg/G top/bottom  q/Esc close",
        ),
        width,
      ),
    );

    // Bottom border.
    result.push(...this.border.render(width));

    return result;
  }

  private renderTabBar(width: number): string {
    const parts: string[] = [];

    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      if (!tab) continue;
      const isActive = i === this.activeTab;

      if (isActive) {
        parts.push(this.theme.fg("accent", this.theme.bold(` ${tab.label} `)));
      } else {
        parts.push(this.theme.fg("dim", ` ${tab.label} `));
      }

      if (i < this.tabs.length - 1) {
        parts.push(this.theme.fg("borderMuted", "\u2502"));
      }
    }

    return truncateToWidth(`  ${parts.join("")}`, width);
  }
}
