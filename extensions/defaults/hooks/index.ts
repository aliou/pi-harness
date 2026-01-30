import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentsDiscoveryManager } from "../lib/agents-discovery";
import { setupAgentsDiscoveryHook } from "./agents-discovery";
import { setupChromeHook } from "./chrome";
import { setupGitRebaseHook } from "./git-rebase";
import { setupNotificationHook } from "./notification";
import { setupSessionNameHook } from "./session-name";
import { setupTerminalTitleHook } from "./terminal-title";

export function setupHooks(
  pi: ExtensionAPI,
  agentsDiscovery: AgentsDiscoveryManager,
) {
  setupAgentsDiscoveryHook(pi, agentsDiscovery);
  setupChromeHook(pi);
  setupGitRebaseHook(pi);
  setupSessionNameHook(pi);
  setupTerminalTitleHook(pi);
  setupNotificationHook(pi);
}
