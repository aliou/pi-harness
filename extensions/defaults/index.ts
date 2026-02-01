import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupHooks } from "./hooks";
import { AgentsDiscoveryManager } from "./lib/agents-discovery";
import { setupTools } from "./lib/tools";
import { setupCommands } from "./setup-commands";

export default function (pi: ExtensionAPI) {
  const agentsDiscovery = new AgentsDiscoveryManager();

  setupHooks(pi, agentsDiscovery);
  setupCommands(pi);
  setupTools(pi);
}
