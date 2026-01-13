import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupChromeHook } from "./chrome";
import { setupSessionNameHook } from "./session-name";

export function setupHooks(pi: ExtensionAPI) {
  setupChromeHook(pi);
  setupSessionNameHook(pi);
}
