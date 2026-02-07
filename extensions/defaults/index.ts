import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "./config";
import { setupHooks } from "./hooks";
import { AgentsDiscoveryManager } from "./lib/agents-discovery";
import { setupTools } from "./lib/tools";
import { setupCommands } from "./setup-commands";

export default async function (pi: ExtensionAPI) {
  // Load config
  await configLoader.load();

  const agentsDiscovery = new AgentsDiscoveryManager();

  setupHooks(pi, agentsDiscovery);
  setupCommands(pi);
  setupTools(pi);
}
