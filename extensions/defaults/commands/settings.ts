/**
 * Settings command for the defaults extension.
 * Provides /ad:settings to edit the catalog array.
 */

import { ArrayEditor, registerSettingsCommand } from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  type DefaultsConfig,
  type ResolvedDefaultsConfig,
} from "../config";

export function registerDefaultsSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<DefaultsConfig, ResolvedDefaultsConfig>(pi, {
    commandName: "defaults:settings",
    commandDescription: "Configure defaults extension settings",
    title: "Defaults Settings",
    configStore: configLoader,
    onSettingChange: (id, newValue, config) => {
      const updated = structuredClone(config);
      if (id === "catalogDepth") {
        updated.catalogDepth = Number.parseInt(newValue, 10);
      }
      return updated;
    },
    buildSections: (tabConfig, resolved, ctx) => {
      const catalog = tabConfig?.catalog ?? resolved.catalog;

      const catalogDepth = tabConfig?.catalogDepth ?? resolved.catalogDepth;

      return [
        {
          label: "Catalog",
          items: [
            {
              id: "catalog",
              label: "Skill/Package directories",
              currentValue:
                catalog.length === 0
                  ? "none"
                  : `${catalog.length} director${catalog.length === 1 ? "y" : "ies"}`,
              description:
                "Directories to scan for skills and packages. Each directory is searched for subdirectories containing SKILL.md (skills) or package.json with a pi key (packages).",
              submenu: (_current, done) => {
                const currentConfig = tabConfig ?? ({} as DefaultsConfig);
                const currentArray = currentConfig.catalog ?? resolved.catalog;

                return new ArrayEditor({
                  label: "Catalog Directories",
                  items: [...currentArray],
                  theme: getSettingsListTheme(),
                  onSave: (items) => {
                    const updated = { ...currentConfig, catalog: items };
                    ctx.setDraft(updated);
                    done(
                      items.length === 0
                        ? "none"
                        : `${items.length} director${items.length === 1 ? "y" : "ies"}`,
                    );
                  },
                  onDone: () => done(undefined),
                });
              },
            },
            {
              id: "catalogDepth",
              label: "Scan depth",
              currentValue: String(catalogDepth),
              values: ["1", "2", "3", "4", "5"],
              description:
                "How many directory levels deep to scan for skills and packages.",
            },
          ],
        },
      ];
    },
  });
}
