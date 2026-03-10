import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupFooterHook } from "./footer";
import { setupNotificationHook } from "./notification";
import { setupSessionNameHook } from "./session-name";
import { setupSystemPromptHook } from "./system-prompt";
import { setupTerminalTitleHook } from "./terminal-title";

export function setupHooks(pi: ExtensionAPI) {
  setupSessionNameHook(pi);
  setupTerminalTitleHook(pi);
  setupNotificationHook(pi);
  setupFooterHook(pi);
  setupSystemPromptHook(pi);
}
