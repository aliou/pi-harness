import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader, getProviderSettings } from "../config";
import { refreshWidget } from "../hooks/usage-bar";
import { getProviderKeyFromModel } from "../provider-registry";

export function setupToggleBarCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:toggle-widget", {
    description: "Toggle the usage bar widget",
    handler: async (_args, cmdCtx) => {
      const providerKey = getProviderKeyFromModel(cmdCtx.model);
      if (!providerKey) {
        cmdCtx.ui.notify("No supported provider active", "warning");
        return;
      }

      const current = getProviderSettings(providerKey);
      const newMode = current.widget === "never" ? "warnings-only" : "never";

      const memoryConfig = configLoader.getRawConfig("memory") ?? {};
      if (!memoryConfig.providers) memoryConfig.providers = {};
      if (!memoryConfig.providers[providerKey])
        memoryConfig.providers[providerKey] = {};
      memoryConfig.providers[providerKey].widget = newMode;

      await configLoader.save("memory", memoryConfig);
      refreshWidget(cmdCtx);

      cmdCtx.ui.notify(
        `Usage bar ${newMode === "never" ? "hidden" : "shown (warnings only)"}`,
        "info",
      );
    },
  });
}
