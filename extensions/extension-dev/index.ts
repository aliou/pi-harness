import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands";
import { setupTools } from "./tools";

export default function (pi: ExtensionAPI) {
  setupTools(pi);
  registerCommands(pi);
}
