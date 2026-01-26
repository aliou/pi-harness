import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupToggleBarCommand } from "./toggle-bar";
import { setupUsageCommand } from "./usage";

export function setupUsageCommands(pi: ExtensionAPI): void {
  setupUsageCommand(pi);
  setupToggleBarCommand(pi);
}
