import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerContextCommand } from "./context";
import { registerExtensionsCommand } from "./extensions";
import { registerSkillsCommand } from "./skills";
import { registerSystemPromptCommand } from "./system-prompt";
import { registerToolsCommand } from "./tools";

export function registerCommands(pi: ExtensionAPI) {
  registerSystemPromptCommand(pi);
  registerToolsCommand(pi);
  registerSkillsCommand(pi);
  registerContextCommand(pi);
  registerExtensionsCommand(pi);
}
