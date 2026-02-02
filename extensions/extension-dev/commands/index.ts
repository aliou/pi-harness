import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerUpdateCommand } from "./update";

export function registerCommands(pi: ExtensionAPI) {
  registerUpdateCommand(pi);
}
