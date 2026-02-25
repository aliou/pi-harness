import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerProvidersSettings } from "./settings-command";
import { setupToggleBarCommand } from "./toggle-widget";
import { setupUsageCommand } from "./usage";

export function setupUsageCommands(pi: ExtensionAPI): void {
  setupUsageCommand(pi);
  setupToggleBarCommand(pi);
  registerProvidersSettings(pi);
}
