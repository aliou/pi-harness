import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "./config";
import { setupHooks } from "./hooks";
import { setupTools } from "./lib/tools";
import { setupCommands } from "./setup-commands";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  setupHooks(pi);
  setupCommands(pi);
  setupTools(pi);
}
