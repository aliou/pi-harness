/**
 * Settings command for the defaults extension.
 */

import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  type DefaultsConfig,
  type ResolvedDefaultsConfig,
} from "../config";
import { updateActiveTools } from "../lib/tools";

export function registerDefaultsSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<DefaultsConfig, ResolvedDefaultsConfig>(pi, {
    commandName: "defaults:settings",
    commandDescription: "Configure defaults extension settings",
    title: "Defaults Settings",
    configStore: configLoader,
    buildSections: (
      _tabConfig: DefaultsConfig | null,
      resolved: ResolvedDefaultsConfig,
    ): SettingsSection[] => {
      return [
        {
          label: "Tools",
          items: [
            {
              id: "hashlineEnabled",
              label: "Hashline editing",
              description:
                "Use line-addressable editing with content hashes. Provides hashline_read and hashline_edit tools instead of standard read. Models reference lines by LINE:HASH instead of reproducing content.",
              currentValue: resolved.hashlineEnabled ? "enabled" : "disabled",
              values: ["enabled", "disabled"],
            },
          ],
        },
        {
          label: "Catalog",
          items: [
            {
              id: "catalogDepth",
              label: "Catalog depth",
              description:
                "Maximum depth for directory tree display in catalog",
              currentValue: resolved.catalogDepth.toString(),
              values: ["1", "2", "3", "4", "5"],
            },
          ],
        },
      ];
    },
    onSave: async () => {
      // Reload config from disk
      await configLoader.load();

      // Update active tools based on new config
      // This toggles between standard and hashline tools without re-registering
      updateActiveTools(pi);
    },
  });
}
