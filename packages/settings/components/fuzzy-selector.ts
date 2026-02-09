import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import {
  fuzzyFilter,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

/**
 * A submenu component for selecting one item from a large list using fuzzy search.
 *
 * Features:
 * - Type to filter items via fuzzy search
 * - Navigate with up/down arrows
 * - Enter to select
 * - Esc to cancel
 * - Shows highlighted item clearly
 * - Scrolls when items exceed maxVisible
 */

export interface FuzzySelectorOptions {
  label: string;
  items: string[];
  currentValue?: string; // pre-select this item if present
  theme: SettingsListTheme;
  onSelect: (value: string) => void;
  onDone: () => void;
  maxVisible?: number; // default 10
}

export class FuzzySelector implements Component {
  private allItems: string[];
  private filteredItems: string[];
  private label: string;
  private theme: SettingsListTheme;
  private onSelect: (value: string) => void;
  private onDone: () => void;
  private selectedIndex = 0;
  private maxVisible: number;
  private input: Input;
  private query = "";

  constructor(options: FuzzySelectorOptions) {
    this.allItems = [...options.items];
    this.filteredItems = [...this.allItems];
    this.label = options.label;
    this.theme = options.theme;
    this.onSelect = options.onSelect;
    this.onDone = options.onDone;
    this.maxVisible = options.maxVisible ?? 10;
    this.input = new Input();

    // Pre-select currentValue if provided and exists in the list
    if (options.currentValue) {
      const index = this.allItems.indexOf(options.currentValue);
      if (index !== -1) {
        this.selectedIndex = index;
      }
    }

    this.input.onSubmit = () => {
      this.selectCurrent();
    };
    this.input.onEscape = () => {
      this.onDone();
    };
  }

  private selectCurrent() {
    if (this.filteredItems.length === 0) return;
    const selected = this.filteredItems[this.selectedIndex];
    if (selected) {
      this.onSelect(selected);
    }
  }

  private updateFilter() {
    this.query = this.input.getValue();
    if (this.query.trim() === "") {
      this.filteredItems = [...this.allItems];
    } else {
      this.filteredItems = fuzzyFilter(
        this.allItems,
        this.query,
        (item) => item,
      );
    }
    // Reset cursor to 0 when filtering
    this.selectedIndex = 0;
  }

  invalidate() {}

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(this.theme.label(` ${this.label}`, true));
    lines.push("");

    // Input field
    lines.push(this.theme.hint("  Search:"));
    lines.push(`  ${this.input.render(width - 4).join("")}`);
    lines.push("");

    // List of filtered items
    if (this.filteredItems.length === 0) {
      lines.push(this.theme.hint("  (no matches)"));
    } else {
      const startIndex = Math.max(
        0,
        Math.min(
          this.selectedIndex - Math.floor(this.maxVisible / 2),
          this.filteredItems.length - this.maxVisible,
        ),
      );
      const endIndex = Math.min(
        startIndex + this.maxVisible,
        this.filteredItems.length,
      );

      for (let i = startIndex; i < endIndex; i++) {
        const item = this.filteredItems[i];
        if (!item) continue;
        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? this.theme.cursor : "  ";
        const prefixWidth = visibleWidth(prefix);
        const maxItemWidth = width - prefixWidth - 2;
        const text = this.theme.value(
          truncateToWidth(item, maxItemWidth, ""),
          isSelected,
        );
        lines.push(prefix + text);
      }

      // Show count indicator when scrolling
      if (startIndex > 0 || endIndex < this.filteredItems.length) {
        lines.push(
          this.theme.hint(
            `  (${this.selectedIndex + 1}/${this.filteredItems.length})`,
          ),
        );
      }
    }

    lines.push("");
    lines.push(this.theme.hint("  Type to search · Enter: select · Esc: back"));

    return lines;
  }

  handleInput(data: string) {
    // Navigation and selection
    if (matchesKey(data, Key.up)) {
      if (this.filteredItems.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.filteredItems.length - 1
          : this.selectedIndex - 1;
    } else if (matchesKey(data, Key.down)) {
      if (this.filteredItems.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === this.filteredItems.length - 1
          ? 0
          : this.selectedIndex + 1;
    } else if (matchesKey(data, Key.escape)) {
      this.onDone();
    } else {
      // Delegate to input handler
      this.input.handleInput(data);
      this.updateFilter();
    }
  }
}
