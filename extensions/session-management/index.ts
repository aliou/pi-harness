import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupSessionCommands } from "./commands";

export default function (pi: ExtensionAPI) {
  setupSessionCommands(pi);
}
