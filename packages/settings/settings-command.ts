/**
 * Settings command registration helper.
 *
 * Creates a /{name}:settings command with Local/Global tabs.
 * Changes are tracked in memory. Ctrl+S saves, Esc exits without saving.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import {
  SectionedSettings,
  type SettingsSection,
} from "./components/sectioned-settings";
import type { ConfigStore } from "./config-loader";
import { displayToStorageValue, setNestedValue } from "./helpers";

type Tab = "local" | "global";

export interface SettingsCommandOptions<
  TConfig extends object,
  TResolved extends object,
> {
  /** Command name, e.g. "toolchain:settings" */
  commandName: string;
  /** Command description for the command palette. */
  commandDescription?: string;
  /** Title shown at the top of the settings UI. */
  title: string;
  /** Config store (ConfigLoader or custom implementation). */
  configStore: ConfigStore<TConfig, TResolved>;
  /**
   * Build the sections for the current tab.
   * Called on initial render, tab switch, and after saving.
   *
   * Use ctx.setDraft in submenu onSave callbacks to store changes
   * in the draft. All changes (toggles, enums, submenus) are only
   * persisted to disk on Ctrl+S.
   */
  buildSections: (
    tabConfig: TConfig | null,
    resolved: TResolved,
    ctx: { setDraft: (config: TConfig) => void },
  ) => SettingsSection[];
  /**
   * Custom change handler. Receives the setting ID, new display value,
   * and a clone of the current tab config. Return the updated config,
   * or null to skip the change.
   *
   * If not provided, the default handler maps boolean display values
   * (enabled/disabled, on/off) to true/false and sets via dotted path.
   * Enum strings (e.g. "pnpm") are stored as-is.
   */
  onSettingChange?: (
    id: string,
    newValue: string,
    config: TConfig,
  ) => TConfig | null;
  /**
   * Called after save succeeds. Use this to reload runtime state
   * that was captured at extension init time.
   */
  onSave?: () => void | Promise<void>;
}

function defaultChangeHandler<TConfig extends object>(
  id: string,
  newValue: string,
  config: TConfig,
): TConfig {
  const updated = structuredClone(config);
  setNestedValue(updated, id, displayToStorageValue(newValue));
  return updated;
}

/**
 * Find whether an item in the given sections has a submenu.
 * Used to distinguish value cycling (track draft) from submenu close (refresh only).
 */
function isSubmenuItem(sections: SettingsSection[], id: string): boolean {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.id === id && item.submenu) return true;
    }
  }
  return false;
}

export function registerSettingsCommand<
  TConfig extends object,
  TResolved extends object,
>(pi: ExtensionAPI, options: SettingsCommandOptions<TConfig, TResolved>): void {
  const {
    commandName,
    title,
    configStore,
    buildSections,
    onSettingChange,
    onSave,
  } = options;
  const description =
    options.commandDescription ??
    `Configure ${commandName.split(":")[0]} (local/global)`;
  const extensionLabel = commandName.split(":")[0] ?? title;

  pi.registerCommand(commandName, {
    description,
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      let activeTab: Tab = configStore.hasConfig("project")
        ? "local"
        : "global";

      await ctx.ui.custom((tui, theme, _kb, done) => {
        let settings: SectionedSettings | null = null;
        let currentSections: SettingsSection[] = [];
        const settingsTheme = getSettingsListTheme();

        // Per-tab draft configs. null = no changes from disk.
        const drafts: Record<Tab, TConfig | null> = {
          local: null,
          global: null,
        };

        // --- Helpers ---

        function tabScope(): "global" | "project" {
          return activeTab === "local" ? "project" : "global";
        }

        /** Get the effective config for the active tab (draft or disk). */
        function getTabConfig(): TConfig | null {
          return drafts[activeTab] ?? configStore.getRawConfig(tabScope());
        }

        function isDirty(): boolean {
          return drafts.local !== null || drafts.global !== null;
        }

        function getSections(): SettingsSection[] {
          const tabConfig = getTabConfig();
          const resolved = configStore.getConfig();
          currentSections = buildSections(tabConfig, resolved, {
            setDraft: (config) => {
              drafts[activeTab] = config;
            },
          });
          return currentSections;
        }

        function refresh(): void {
          settings?.updateSections(getSections());
          tui.requestRender();
        }

        function buildSettingsComponent(tab: Tab): SectionedSettings {
          return new SectionedSettings(
            getSections(),
            15,
            settingsTheme,
            (id, newValue) => {
              handleChange(tab, id, newValue);
            },
            () => done(undefined),
            { enableSearch: true, hintSuffix: "Ctrl+S to save" },
          );
        }

        // --- Change handler (in-memory only) ---

        function handleChange(tab: Tab, id: string, newValue: string): void {
          // Submenu items handle their own saving.
          if (isSubmenuItem(currentSections, id)) {
            refresh();
            return;
          }

          const current = getTabConfig();
          const handler = onSettingChange ?? defaultChangeHandler;
          const updated = handler(
            id,
            newValue,
            structuredClone(current ?? ({} as TConfig)),
          );
          if (!updated) return;

          // Store in draft, don't write to disk yet.
          drafts[tab] = updated;
          tui.requestRender();
        }

        // --- Save handler (Ctrl+S) ---

        async function save(): Promise<void> {
          let saved = false;

          for (const tab of ["local", "global"] as const) {
            const draft = drafts[tab];
            if (!draft) continue;

            const scope = tab === "local" ? "project" : "global";
            try {
              await configStore.save(scope, draft);
              drafts[tab] = null;
              saved = true;
            } catch (error) {
              ctx.ui.notify(`Failed to save ${tab}: ${error}`, "error");
            }
          }

          if (saved) {
            ctx.ui.notify(`${extensionLabel}: saved`, "info");
            if (onSave) await onSave();
            // Rebuild with fresh disk data.
            settings = buildSettingsComponent(activeTab);
          }

          tui.requestRender();
        }

        // --- Tab rendering ---

        function renderTabs(): string[] {
          const dirtyMark = (tab: Tab) => (drafts[tab] ? " *" : "");

          const localLabel =
            activeTab === "local"
              ? theme.bg(
                  "selectedBg",
                  theme.fg("accent", ` Local${dirtyMark("local")} `),
                )
              : theme.fg("dim", ` Local${dirtyMark("local")} `);
          const globalLabel =
            activeTab === "global"
              ? theme.bg(
                  "selectedBg",
                  theme.fg("accent", ` Global${dirtyMark("global")} `),
                )
              : theme.fg("dim", ` Global${dirtyMark("global")} `);

          return ["", `  ${localLabel}  ${globalLabel}`, ""];
        }

        function handleTabSwitch(data: string): boolean {
          if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
            activeTab = activeTab === "local" ? "global" : "local";
            settings = buildSettingsComponent(activeTab);
            tui.requestRender();
            return true;
          }
          return false;
        }

        // --- Init ---

        settings = buildSettingsComponent(activeTab);

        return {
          render(width: number) {
            const lines: string[] = [];
            lines.push(theme.fg("accent", theme.bold(title)));
            lines.push(...renderTabs());
            lines.push(...(settings?.render(width) ?? []));
            return lines;
          },
          invalidate() {
            settings?.invalidate?.();
          },
          handleInput(data: string) {
            // Ctrl+S: save all dirty tabs.
            if (matchesKey(data, Key.ctrl("s"))) {
              if (isDirty()) void save();
              return;
            }

            if (!settings?.hasActiveSubmenu() && handleTabSwitch(data)) return;
            settings?.handleInput?.(data);
            tui.requestRender();
          },
        };
      });
    },
  });
}
