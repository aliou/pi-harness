import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader, getProviderSettings, type ProviderKey } from "../config";
import { refreshWidget } from "../hooks/usage-bar";

function getProviderKey(
  ctx: Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1],
): ProviderKey | null {
  const model = ctx.model;
  if (!model) return null;
  const provider = model.provider.toLowerCase();
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai-codex") return "openai-codex";
  if (provider === "synthetic") return "synthetic";

  return null;
}

export function setupToggleBarCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:toggle-widget", {
    description: "Toggle the usage bar widget",
    handler: async (_args, cmdCtx) => {
      const providerKey = getProviderKey(cmdCtx);
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
