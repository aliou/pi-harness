/**
 * Setup wizard for the example extension.
 *
 * Demonstrates the multi-step ctx.ui.custom pattern:
 * - Each step is a Component that calls done() when complete
 * - Steps are chained sequentially; returning undefined = cancel
 * - Config is saved at the end after all steps succeed
 *
 * Use a setup command for first-time onboarding or multi-step configuration
 * that doesn't fit the settings UI model.
 */

import { FuzzySelector } from "@aliou/pi-utils-settings";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  DynamicBorder,
  getSettingsListTheme,
} from "@mariozechner/pi-coding-agent";
import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import { configLoader, type ExampleConfig } from "../config";

// --- Step 1: Text input ---

class TextPrompt implements Component {
  private input: Input;
  private done: (value: string | undefined) => void;
  private theme: SettingsListTheme;
  private title: string;
  private prompt: string;

  constructor(
    theme: SettingsListTheme,
    title: string,
    prompt: string,
    currentValue: string,
    done: (value: string | undefined) => void,
  ) {
    this.theme = theme;
    this.title = title;
    this.prompt = prompt;
    this.done = done;
    this.input = new Input();
    if (currentValue) this.input.setValue(currentValue);

    this.input.onSubmit = () => {
      const value = this.input.getValue().trim();
      if (!value) return;
      this.done(value);
    };
    this.input.onEscape = () => this.done(undefined);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(this.theme.label(` ${this.title}`, true));
    lines.push("");
    lines.push(this.theme.hint(`  ${this.prompt}`));
    lines.push(`  ${this.input.render(width - 4).join("")}`);
    lines.push("");
    lines.push(this.theme.hint("  Enter: confirm · Esc: cancel"));
    return lines;
  }

  invalidate() {}

  handleInput(data: string) {
    this.input.handleInput(data);
  }
}

// --- Step 2: Multi-select (toggle items on/off) ---

interface ToggleItem {
  label: string;
  value: string;
  selected: boolean;
}

class MultiSelect implements Component {
  private items: ToggleItem[];
  private theme: SettingsListTheme;
  private title: string;
  private done: (values: string[] | undefined) => void;
  private selectedIndex = 0;

  constructor(
    theme: SettingsListTheme,
    title: string,
    items: ToggleItem[],
    done: (values: string[] | undefined) => void,
  ) {
    this.theme = theme;
    this.title = title;
    this.items = items;
    this.done = done;
  }

  render(_width: number): string[] {
    const lines: string[] = [];
    lines.push(this.theme.label(` ${this.title}`, true));
    lines.push("");

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.theme.cursor : "  ";
      const check = item.selected ? "[x]" : "[ ]";
      const label = this.theme.value(`${check} ${item.label}`, isSelected);
      lines.push(`${prefix}${label}`);
    }

    lines.push("");
    lines.push(
      this.theme.hint("  Space: toggle · Enter: confirm · Esc: cancel"),
    );
    return lines;
  }

  invalidate() {}

  handleInput(data: string) {
    if (matchesKey(data, Key.up)) {
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.items.length - 1
          : this.selectedIndex - 1;
    } else if (matchesKey(data, Key.down)) {
      this.selectedIndex =
        this.selectedIndex === this.items.length - 1
          ? 0
          : this.selectedIndex + 1;
    } else if (data === " ") {
      const item = this.items[this.selectedIndex];
      if (item) item.selected = !item.selected;
    } else if (matchesKey(data, Key.enter)) {
      const selected = this.items.filter((i) => i.selected).map((i) => i.value);
      this.done(selected);
    } else if (matchesKey(data, Key.escape)) {
      this.done(undefined);
    }
  }
}

// --- Bordered wrapper ---
// Wraps any Component with DynamicBorder top/bottom lines.

class BorderedWrapper implements Component {
  private border: DynamicBorder;

  constructor(
    private inner: Component,
    theme: Theme,
  ) {
    this.border = new DynamicBorder((segment) => theme.fg("border", segment));
  }

  render(width: number): string[] {
    return [
      ...this.border.render(width),
      ...this.inner.render(width),
      ...this.border.render(width),
    ];
  }

  invalidate(): void {
    this.inner.invalidate?.();
  }

  handleInput(data: string): void {
    this.inner.handleInput?.(data);
  }
}

// --- Command registration ---

export function registerExampleSetup(
  pi: ExtensionAPI,
  onConfigChange: (ctx: ExtensionContext) => void,
): void {
  pi.registerCommand("example:setup", {
    description: "First-time setup wizard for example extension",
    handler: async (_args, ctx) => {
      const settingsTheme = getSettingsListTheme();
      const config = configLoader.getConfig();

      // Step 1: pick a theme via FuzzySelector
      const theme = await ctx.ui.custom<string | undefined>(
        (_tui, uiTheme, _kb, done) => {
          return new BorderedWrapper(
            new FuzzySelector({
              label: "Example Setup (1/3) - Pick a theme",
              items: [
                "dark",
                "light",
                "solarized-dark",
                "solarized-light",
                "monokai",
                "nord",
                "dracula",
                "gruvbox",
                "catppuccin",
                "tokyo-night",
              ],
              currentValue: config.appearance.theme,
              theme: settingsTheme,
              onSelect: (selected) => done(selected),
              onDone: () => done(undefined),
            }),
            uiTheme,
          );
        },
      );
      if (!theme) return;

      // Step 2: enter a favorite item via text input
      const favorite = await ctx.ui.custom<string | undefined>(
        (_tui, uiTheme, _kb, done) => {
          return new BorderedWrapper(
            new TextPrompt(
              settingsTheme,
              "Example Setup (2/3) - Add a favorite",
              "Enter a favorite item (or Esc to skip):",
              "",
              done,
            ),
            uiTheme,
          );
        },
      );
      // Note: not returning on undefined here -- this step is optional

      // Step 3: toggle editor features via multi-select
      const features = await ctx.ui.custom<string[] | undefined>(
        (_tui, uiTheme, _kb, done) => {
          return new BorderedWrapper(
            new MultiSelect(
              settingsTheme,
              "Example Setup (3/3) - Editor features",
              [
                {
                  label: "Auto save",
                  value: "autoSave",
                  selected: config.editor.autoSave,
                },
                {
                  label: "Format on save",
                  value: "formatOnSave",
                  selected: config.editor.formatOnSave,
                },
              ],
              done,
            ),
            uiTheme,
          );
        },
      );
      if (!features) return;

      // Save all collected values at once
      const newConfig: ExampleConfig = {
        appearance: { theme },
        editor: {
          autoSave: features.includes("autoSave"),
          formatOnSave: features.includes("formatOnSave"),
        },
      };
      if (favorite) {
        newConfig.favorites = [favorite];
      }

      await configLoader.save("global", newConfig);
      onConfigChange(ctx);
      ctx.ui.notify("Setup complete", "info");
    },
  });
}
