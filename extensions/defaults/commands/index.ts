import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerProjectInitCommand } from "./project-init";
import { registerDefaultsSettings } from "./settings";
import { registerSystemPromptCommand } from "./system-prompt";
import { registerThemeCommand } from "./theme";

export function registerCommands(pi: ExtensionAPI) {
  registerThemeCommand(pi);
  registerSystemPromptCommand(pi);
  registerProjectInitCommand(pi);
  registerDefaultsSettings(pi);
}
