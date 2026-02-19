/**
 * Setup wizard for the example extension.
 *
 * Demonstrates the Wizard component:
 * - All steps shown as tabs in a single bordered frame
 * - Tab/Shift+Tab navigates between steps
 * - Each step has its own inner Component
 * - Steps call markComplete() when they have valid data
 * - Ctrl+S submits, Esc cancels
 */

import {
  FuzzySelector,
  Wizard,
  type WizardStepContext,
} from "@aliou/pi-utils-settings";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import { configLoader, type ExampleConfig } from "../config";

// --- Collected wizard state ---
// Shared mutable object that each step writes into.

interface WizardState {
  theme: string | null;
  favorite: string | null;
  autoSave: boolean;
  formatOnSave: boolean;
}

// --- Step components ---
// Each step reads/writes to the shared WizardState and calls
// markComplete()/markIncomplete() to update progress indicators.

class ThemeStep implements Component {
  private selector: FuzzySelector;

  constructor(
    state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    this.selector = new FuzzySelector({
      label: "Pick a theme",
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
      currentValue: state.theme ?? undefined,
      theme: settingsTheme,
      onSelect: (selected) => {
        state.theme = selected;
        wizardCtx.markComplete();
      },
      // onDone is a no-op here; the Wizard handles Esc globally
      onDone: () => {},
    });
  }

  render(width: number): string[] {
    return this.selector.render(width);
  }

  invalidate(): void {
    this.selector.invalidate?.();
  }

  handleInput(data: string): void {
    // Filter out keys the Wizard handles globally
    if (matchesKey(data, Key.escape)) return;
    this.selector.handleInput(data);
  }
}

class FavoriteStep implements Component {
  private input: Input;
  private settingsTheme: SettingsListTheme;

  constructor(
    private state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    this.settingsTheme = settingsTheme;
    this.input = new Input();
    if (state.favorite) this.input.setValue(state.favorite);

    this.input.onSubmit = () => {
      const value = this.input.getValue().trim();
      state.favorite = value || null;
      if (value) wizardCtx.markComplete();
      else wizardCtx.markIncomplete();
    };
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(this.settingsTheme.label(" Add a favorite", true));
    lines.push("");
    lines.push(
      this.settingsTheme.hint("  Enter an item (optional, Enter to confirm):"),
    );
    lines.push(`  ${this.input.render(width - 4).join("")}`);

    if (this.state.favorite) {
      lines.push("");
      lines.push(this.settingsTheme.hint(`  Current: ${this.state.favorite}`));
    }

    return lines;
  }

  invalidate() {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return;
    this.input.handleInput(data);
  }
}

class EditorFeaturesStep implements Component {
  private items: Array<{
    label: string;
    value: keyof WizardState;
    selected: boolean;
  }>;
  private settingsTheme: SettingsListTheme;
  private selectedIndex = 0;

  constructor(
    private state: WizardState,
    settingsTheme: SettingsListTheme,
    wizardCtx: WizardStepContext,
  ) {
    this.settingsTheme = settingsTheme;
    this.items = [
      { label: "Auto save", value: "autoSave", selected: state.autoSave },
      {
        label: "Format on save",
        value: "formatOnSave",
        selected: state.formatOnSave,
      },
    ];
    // Always complete since toggles have defaults
    wizardCtx.markComplete();
  }

  render(_width: number): string[] {
    const lines: string[] = [];
    lines.push(this.settingsTheme.label(" Editor features", true));
    lines.push("");

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.settingsTheme.cursor : "  ";
      const check = item.selected ? "[x]" : "[ ]";
      const label = this.settingsTheme.value(
        `${check} ${item.label}`,
        isSelected,
      );
      lines.push(`${prefix}${label}`);
    }

    return lines;
  }

  invalidate() {}

  handleInput(data: string): void {
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
    } else if (data === " " || matchesKey(data, Key.enter)) {
      const item = this.items[this.selectedIndex];
      if (item) {
        item.selected = !item.selected;
        // Write back to shared state
        this.state[item.value] = item.selected as never;
      }
    }
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
      const currentConfig = configLoader.getConfig();

      // Shared state across all wizard steps
      const state: WizardState = {
        theme: currentConfig.appearance.theme,
        favorite: null,
        autoSave: currentConfig.editor.autoSave,
        formatOnSave: currentConfig.editor.formatOnSave,
      };

      const saved = await ctx.ui.custom<boolean>((_tui, uiTheme, _kb, done) => {
        return new Wizard({
          title: "Example Setup",
          theme: uiTheme,
          onComplete: () => done(true),
          onCancel: () => done(false),
          steps: [
            {
              label: "Theme",
              build: (wizardCtx) => {
                // Pre-mark complete if we have a default
                if (state.theme) wizardCtx.markComplete();
                return new ThemeStep(state, settingsTheme, wizardCtx);
              },
            },
            {
              label: "Favorite",
              build: (wizardCtx) =>
                new FavoriteStep(state, settingsTheme, wizardCtx),
            },
            {
              label: "Editor",
              build: (wizardCtx) =>
                new EditorFeaturesStep(state, settingsTheme, wizardCtx),
            },
          ],
        });
      });

      if (!saved) return;

      // Build config from wizard state
      const newConfig: ExampleConfig = {
        appearance: { theme: state.theme ?? undefined },
        editor: {
          autoSave: state.autoSave,
          formatOnSave: state.formatOnSave,
        },
      };
      if (state.favorite) {
        newConfig.favorites = [state.favorite];
      }

      await configLoader.save("global", newConfig);
      onConfigChange(ctx);
      ctx.ui.notify("Setup complete", "info");
    },
  });
}
