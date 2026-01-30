import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAgentsDiscoveryRenderer } from "./components/agents-discovery";
import { setupHooks } from "./hooks";
import { AgentsDiscoveryManager } from "./lib/agents-discovery";
import { setupTools } from "./lib/tools";
import { setupCommands } from "./setup-commands";

export default function (pi: ExtensionAPI) {
  const agentsDiscovery = new AgentsDiscoveryManager();

  registerAgentsDiscoveryRenderer(pi);
  setupHooks(pi, agentsDiscovery);
  setupCommands(pi);
  setupTools(pi);
}
