import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupCreateAccountCommand } from "./create-account";
import { setupDeleteAccountCommand } from "./delete-account";
import { setupListAccountsCommand } from "./list-accounts";
import { registerProvidersSettings } from "./settings-command";
import { setupToggleBarCommand } from "./toggle-widget";
import { setupUsageCommand } from "./usage";

export function setupUsageCommands(pi: ExtensionAPI): void {
  setupUsageCommand(pi);
  setupToggleBarCommand(pi);
  registerProvidersSettings(pi);
  setupCreateAccountCommand(pi);
  setupListAccountsCommand(pi);
  setupDeleteAccountCommand(pi);
}
