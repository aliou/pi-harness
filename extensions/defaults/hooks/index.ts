import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupChromeHook } from "./chrome";
import { setupNotificationHook } from "./notification";
import { setupSessionNameHook } from "./session-name";
import { setupTerminalTitleHook } from "./terminal-title";

export function setupHooks(pi: ExtensionAPI) {
  setupChromeHook(pi);
  setupSessionNameHook(pi);
  setupTerminalTitleHook(pi);
  setupNotificationHook(pi);
}
