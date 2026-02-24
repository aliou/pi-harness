import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerProjectInitCommand } from "./project-init";
import { registerDefaultsSettings } from "./settings";
import { registerThemeCommand } from "./theme";
import { registerDefaultsUpdateCommand } from "./update";

export function registerCommands(pi: ExtensionAPI) {
  registerThemeCommand(pi);
  registerProjectInitCommand(pi);
  registerDefaultsSettings(pi);
  registerDefaultsUpdateCommand(pi);
}
