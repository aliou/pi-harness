import type { Component } from "@mariozechner/pi-tui";
import {
  Input,
  Key,
  matchesKey,
  type SettingItem,
  type SettingsListTheme,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

/**
 * A sectioned settings list. Items are grouped under section headers.
 * Cursor skips section headers and only lands on items.
 *
 * Supports the same SettingItem interface as pi-tui's SettingsList,
 * including value cycling and submenus.
 */

export interface SettingsSection {
  label: string;
  items: SettingItem[];
}

export interface SectionedSettingsOptions {
  enableSearch?: boolean;
  /** Extra text appended to the hint line (e.g. "Ctrl+S to save"). */
  hintSuffix?: string;
}

interface FlatEntry {
  type: "section" | "item";
  sectionLabel?: string;
  item?: SettingItem;
}

export class SectionedSettings implements Component {
  private sections: SettingsSection[];
  private flatEntries: FlatEntry[];
  private filteredEntries: FlatEntry[];
  private theme: SettingsListTheme;
  private selectedIndex: number; // index into selectable items only
  private maxVisible: number;
  private onChange: (id: string, newValue: string) => void;
  private onCancel: () => void;
  private searchInput?: Input;
  private searchEnabled: boolean;
  private hintSuffix: string;
  private submenuComponent: Component | null = null;
  private submenuItemIndex: number | null = null;

  constructor(
    sections: SettingsSection[],
    maxVisible: number,
    theme: SettingsListTheme,
    onChange: (id: string, newValue: string) => void,
    onCancel: () => void,
    options: SectionedSettingsOptions = {},
  ) {
    this.sections = sections;
    this.maxVisible = maxVisible;
    this.theme = theme;
    this.onChange = onChange;
    this.onCancel = onCancel;
    this.searchEnabled = options.enableSearch ?? false;
    this.hintSuffix = options.hintSuffix ?? "";
    this.selectedIndex = 0;

    if (this.searchEnabled) {
      this.searchInput = new Input();
    }

    this.flatEntries = this.buildFlatEntries(sections);
    this.filteredEntries = this.flatEntries;
  }

  private buildFlatEntries(sections: SettingsSection[]): FlatEntry[] {
    const entries: FlatEntry[] = [];
    for (const section of sections) {
      entries.push({ type: "section", sectionLabel: section.label });
      for (const item of section.items) {
        entries.push({ type: "item", item });
      }
    }
    return entries;
  }

  private getSelectableItems(): SettingItem[] {
    return this.filteredEntries
      .filter((e) => e.type === "item" && e.item)
      .map((e) => e.item as SettingItem);
  }

  /**
   * Replace all sections while preserving the cursor position.
   * The cursor is restored by matching the previously selected item's ID.
   * If the item no longer exists, the index is clamped to the valid range.
   *
   * Use this instead of creating a new SectionedSettings instance when
   * only values or item counts change (e.g., after saving a setting).
   */
  updateSections(sections: SettingsSection[]): void {
    const currentId = this.getSelectableItems()[this.selectedIndex]?.id;

    this.sections = sections;
    this.flatEntries = this.buildFlatEntries(sections);
    this.filterEntries(this.searchInput?.getValue() ?? "");

    // Restore cursor by item ID.
    if (currentId) {
      const items = this.getSelectableItems();
      const idx = items.findIndex((i) => i.id === currentId);
      if (idx >= 0) {
        this.selectedIndex = idx;
        return;
      }
    }

    // Fallback: clamp to valid range.
    const count = this.getSelectableItems().length;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, count - 1));
  }

  updateValue(id: string, newValue: string): void {
    for (const section of this.sections) {
      const item = section.items.find((i) => i.id === id);
      if (item) {
        item.currentValue = newValue;
        return;
      }
    }
  }

  /** Returns true when a submenu is open (caller should not intercept input). */
  hasActiveSubmenu(): boolean {
    return this.submenuComponent !== null;
  }

  invalidate(): void {
    this.submenuComponent?.invalidate?.();
  }

  render(width: number): string[] {
    if (this.submenuComponent) {
      return this.submenuComponent.render(width);
    }
    return this.renderMainList(width);
  }

  private renderMainList(width: number): string[] {
    const lines: string[] = [];

    if (this.searchEnabled && this.searchInput) {
      lines.push(...this.searchInput.render(width));
      lines.push("");
    }

    const allItems = this.getSelectableItems();

    if (allItems.length === 0) {
      lines.push(
        this.theme.hint(
          this.searchEnabled
            ? "  No matching settings"
            : "  No settings available",
        ),
      );
      this.addHintLine(lines);
      return lines;
    }

    // Calculate max label width for alignment
    const maxLabelWidth = Math.min(
      30,
      Math.max(...allItems.map((item) => visibleWidth(item.label))),
    );

    // Build visible entries with their "selectable index"
    let selectableIdx = -1;
    const rendered: Array<{
      line: string;
      isSelected: boolean;
      description?: string;
    }> = [];

    for (const entry of this.filteredEntries) {
      if (entry.type === "section") {
        // Section header - add blank line before (except first)
        if (rendered.length > 0) {
          rendered.push({ line: "", isSelected: false });
        }
        rendered.push({
          line: this.theme.hint(`  ${entry.sectionLabel}`),
          isSelected: false,
        });
        continue;
      }

      const item = entry.item;
      if (!item) continue;

      selectableIdx++;
      const isSelected = selectableIdx === this.selectedIndex;
      const prefix = isSelected ? this.theme.cursor : "  ";
      const prefixWidth = visibleWidth(prefix);

      const labelPadded =
        item.label +
        " ".repeat(Math.max(0, maxLabelWidth - visibleWidth(item.label)));
      const labelText = this.theme.label(labelPadded, isSelected);

      const separator = "  ";
      const usedWidth = prefixWidth + maxLabelWidth + visibleWidth(separator);
      const valueMaxWidth = width - usedWidth - 2;
      const valueText = this.theme.value(
        truncateToWidth(item.currentValue, valueMaxWidth, ""),
        isSelected,
      );

      rendered.push({
        line: prefix + labelText + separator + valueText,
        isSelected,
        description: isSelected ? item.description : undefined,
      });
    }

    // Scrolling: find the rendered index of the selected item
    const selectedRenderedIdx = rendered.findIndex((r) => r.isSelected);
    const totalLines = rendered.length;
    const startLine = Math.max(
      0,
      Math.min(
        selectedRenderedIdx - Math.floor(this.maxVisible / 2),
        totalLines - this.maxVisible,
      ),
    );
    const endLine = Math.min(startLine + this.maxVisible, totalLines);

    for (let i = startLine; i < endLine; i++) {
      const r = rendered[i];
      if (r) lines.push(r.line);
    }

    // Scroll indicator
    if (startLine > 0 || endLine < totalLines) {
      lines.push(
        this.theme.hint(`  (${this.selectedIndex + 1}/${allItems.length})`),
      );
    }

    // Description for selected item
    const selectedItem = allItems[this.selectedIndex];
    if (selectedItem?.description) {
      lines.push("");
      const wrappedDesc = wrapTextWithAnsi(selectedItem.description, width - 4);
      for (const line of wrappedDesc) {
        lines.push(this.theme.description(`  ${line}`));
      }
    }

    this.addHintLine(lines);
    return lines;
  }

  handleInput(data: string): void {
    if (this.submenuComponent) {
      this.submenuComponent.handleInput?.(data);
      return;
    }

    const items = this.getSelectableItems();

    if (matchesKey(data, Key.up)) {
      if (items.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === 0 ? items.length - 1 : this.selectedIndex - 1;
    } else if (matchesKey(data, Key.down)) {
      if (items.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === items.length - 1 ? 0 : this.selectedIndex + 1;
    } else if (matchesKey(data, Key.enter) || data === " ") {
      this.activateItem();
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel();
    } else if (this.searchEnabled && this.searchInput) {
      const sanitized = data.replace(/ /g, "");
      if (!sanitized) return;
      this.searchInput.handleInput(sanitized);
      this.applyFilter(this.searchInput.getValue());
    }
  }

  private activateItem(): void {
    const items = this.getSelectableItems();
    const item = items[this.selectedIndex];
    if (!item) return;

    if (item.submenu) {
      this.submenuItemIndex = this.selectedIndex;
      this.submenuComponent = item.submenu(
        item.currentValue,
        (selectedValue) => {
          if (selectedValue !== undefined) {
            item.currentValue = selectedValue;
            this.onChange(item.id, selectedValue);
          }
          this.closeSubmenu();
        },
      );
    } else if (item.values && item.values.length > 0) {
      const currentIndex = item.values.indexOf(item.currentValue);
      const nextIndex = (currentIndex + 1) % item.values.length;
      const newValue = item.values[nextIndex] as string;
      item.currentValue = newValue;
      this.onChange(item.id, newValue);
    }
  }

  private closeSubmenu(): void {
    this.submenuComponent = null;
    if (this.submenuItemIndex !== null) {
      this.selectedIndex = this.submenuItemIndex;
      this.submenuItemIndex = null;
    }
  }

  /**
   * Apply search filter to entries without resetting the cursor.
   * Used by updateSections() to preserve selection.
   *
   * Matches on both item labels and section labels. When a section label
   * matches, all items in that section are included.
   */
  private filterEntries(query: string): void {
    if (!query) {
      this.filteredEntries = this.flatEntries;
      return;
    }

    const q = query.toLowerCase();
    const filtered: FlatEntry[] = [];
    let currentSection: FlatEntry | null = null;
    let sectionLabelMatches = false;
    let sectionHasMatch = false;
    let sectionItems: FlatEntry[] = [];

    const flushSection = () => {
      if (sectionLabelMatches && currentSection) {
        // Section label matched: include header + all items
        filtered.push(currentSection);
        filtered.push(...sectionItems);
      } else if (sectionHasMatch && currentSection) {
        // Only some items matched: include header + matched items
        filtered.push(currentSection);
        for (const item of sectionItems) {
          if (item.item && item.item.label.toLowerCase().includes(q)) {
            filtered.push(item);
          }
        }
      }
    };

    for (const entry of this.flatEntries) {
      if (entry.type === "section") {
        flushSection();
        currentSection = entry;
        sectionLabelMatches = (entry.sectionLabel ?? "")
          .toLowerCase()
          .includes(q);
        sectionHasMatch = sectionLabelMatches;
        sectionItems = [];
        continue;
      }

      if (entry.item) {
        sectionItems.push(entry);
        if (entry.item.label.toLowerCase().includes(q)) {
          sectionHasMatch = true;
        }
      }
    }
    flushSection();

    this.filteredEntries = filtered;
  }

  /** Apply search filter and reset cursor to the first item. */
  private applyFilter(query: string): void {
    this.filterEntries(query);
    this.selectedIndex = 0;
  }

  private addHintLine(lines: string[]): void {
    const suffix = this.hintSuffix ? ` \u00B7 ${this.hintSuffix}` : "";
    const base = this.searchEnabled
      ? "  Type to search \u00B7 Enter/Space to change \u00B7 Esc to close"
      : "  Enter/Space to change \u00B7 Esc to close";
    lines.push("");
    lines.push(this.theme.hint(base + suffix));
  }
}
