/**
 * Settings command registration helper.
 *
 * Creates a /{name}:settings command with tabs for each enabled scope.
 * Changes are tracked in memory. Ctrl+S saves, Esc exits without saving.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import {
  SectionedSettings,
  type SettingsSection,
} from "./components/sectioned-settings";
import type { ConfigStore, Scope } from "./config-loader";
import {
  displayToStorageValue,
  getNestedValue,
  setNestedValue,
} from "./helpers";

/** Display labels for each scope */
const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global",
  local: "Local",
  memory: "Memory",
};

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
   *
   * For memory scope, tabConfig is null when no overrides exist yet.
   * Use resolved values as display values in that case.
   */
  buildSections: (
    tabConfig: TConfig | null,
    resolved: TResolved,
    ctx: {
      setDraft: (config: TConfig) => void;
      scope: Scope;
      isInherited: (path: string) => boolean;
    },
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
    `Configure ${commandName.split(":")[0]} settings`;
  const extensionLabel = commandName.split(":")[0] ?? title;

  pi.registerCommand(commandName, {
    description,
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const enabledScopes = configStore.getEnabledScopes();
      if (enabledScopes.length === 0) {
        ctx.ui.notify("No scopes configured", "error");
        return;
      }

      // Default to first scope with existing config, else first enabled scope
      // Safe: we check enabledScopes.length > 0 above
      let activeScope: Scope =
        enabledScopes.find((s) => configStore.hasConfig(s)) ??
        (enabledScopes[0] as Scope);

      await ctx.ui.custom((tui, theme, _kb, done) => {
        let settings: SectionedSettings | null = null;
        let currentSections: SettingsSection[] = [];
        const settingsTheme = getSettingsListTheme();

        // Per-scope draft configs. null = no changes from disk/memory.
        const drafts: Partial<Record<Scope, TConfig | null>> = {};
        for (const scope of enabledScopes) {
          drafts[scope] = null;
        }

        // --- Helpers ---

        /** Get the effective config for the active scope (draft or stored). */
        function getTabConfig(): TConfig | null {
          return drafts[activeScope] ?? configStore.getRawConfig(activeScope);
        }

        /**
         * For memory scope: check if a path has a value in memory config.
         * If not, it's inherited from lower-priority scopes.
         */
        function isInherited(path: string): boolean {
          if (activeScope !== "memory") return false;
          const memoryConfig =
            drafts.memory ?? configStore.getRawConfig("memory");
          if (!memoryConfig) return true; // No memory config = all inherited
          return getNestedValue(memoryConfig, path) === undefined;
        }

        function isDirty(): boolean {
          return enabledScopes.some((scope) => drafts[scope] !== null);
        }

        function getSections(): SettingsSection[] {
          const tabConfig = getTabConfig();
          const resolved = configStore.getConfig();
          currentSections = buildSections(tabConfig, resolved, {
            setDraft: (config) => {
              drafts[activeScope] = config;
            },
            scope: activeScope,
            isInherited,
          });
          return currentSections;
        }

        function refresh(): void {
          settings?.updateSections(getSections());
          tui.requestRender();
        }

        function buildSettingsComponent(scope: Scope): SectionedSettings {
          return new SectionedSettings(
            getSections(),
            15,
            settingsTheme,
            (id, newValue) => {
              handleChange(scope, id, newValue);
            },
            () => done(undefined),
            { enableSearch: true, hintSuffix: "Ctrl+S to save" },
          );
        }

        // --- Change handler (in-memory only) ---

        function handleChange(
          scope: Scope,
          id: string,
          newValue: string,
        ): void {
          // Submenu items handle their own saving.
          if (isSubmenuItem(currentSections, id)) {
            refresh();
            return;
          }

          // For memory scope with no existing config, start from merged config
          let current = getTabConfig();
          if (scope === "memory" && current === null) {
            current = configStore.getConfig() as unknown as TConfig;
          }

          const handler = onSettingChange ?? defaultChangeHandler;
          const updated = handler(
            id,
            newValue,
            structuredClone(current ?? ({} as TConfig)),
          );
          if (!updated) return;

          // Store in draft, don't write to disk yet.
          drafts[scope] = updated;
          tui.requestRender();
        }

        // --- Save handler (Ctrl+S) ---

        async function save(): Promise<void> {
          let saved = false;

          for (const scope of enabledScopes) {
            const draft = drafts[scope];
            if (!draft) continue;

            try {
              await configStore.save(scope, draft);
              drafts[scope] = null;
              saved = true;
            } catch (error) {
              ctx.ui.notify(
                `Failed to save ${SCOPE_LABELS[scope]}: ${error}`,
                "error",
              );
            }
          }

          if (saved) {
            ctx.ui.notify(`${extensionLabel}: saved`, "info");
            if (onSave) await onSave();
            // Rebuild with fresh data.
            settings = buildSettingsComponent(activeScope);
          }

          tui.requestRender();
        }

        // --- Tab rendering ---

        function renderTabs(): string[] {
          // Single scope = no tabs needed
          if (enabledScopes.length === 1) {
            return [""];
          }

          const tabLabels = enabledScopes.map((scope) => {
            const label = SCOPE_LABELS[scope];
            const dirtyMark = drafts[scope] ? " *" : "";
            const fullLabel = ` ${label}${dirtyMark} `;

            if (scope === activeScope) {
              return theme.bg("selectedBg", theme.fg("accent", fullLabel));
            }
            return theme.fg("dim", fullLabel);
          });

          return ["", `  ${tabLabels.join("  ")}`, ""];
        }

        function handleTabSwitch(data: string): boolean {
          // Single scope = no tab switching
          if (enabledScopes.length <= 1) return false;

          if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
            const currentIndex = enabledScopes.indexOf(activeScope);
            const direction = matchesKey(data, Key.shift("tab")) ? -1 : 1;
            const nextIndex =
              (currentIndex + direction + enabledScopes.length) %
              enabledScopes.length;
            activeScope = enabledScopes[nextIndex] as Scope;
            settings = buildSettingsComponent(activeScope);
            tui.requestRender();
            return true;
          }
          return false;
        }

        // --- Init ---

        settings = buildSettingsComponent(activeScope);

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
