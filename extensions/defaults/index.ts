import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupCommands } from "./commands";
import { setupHooks } from "./hooks";

export default function (pi: ExtensionAPI) {
  setupHooks(pi);
  setupCommands(pi);
}
