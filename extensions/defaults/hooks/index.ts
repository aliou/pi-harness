import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupAutoThemeHook } from "./auto-theme";
import { setupChromeHook } from "./chrome";
import { setupSessionNameHook } from "./session-name";

export function setupHooks(pi: ExtensionAPI) {
  setupAutoThemeHook(pi);
  setupChromeHook(pi);
  setupSessionNameHook(pi);
}
