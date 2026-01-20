import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupDumbZoneCommands } from "./commands";
import { setupDumbZoneHooks } from "./hooks";

/**
 * The Dumb Zone Extension
 *
 * Shows an overlay when the agent response contains matching phrases.
 */
export default function (pi: ExtensionAPI) {
  setupDumbZoneHooks(pi);
  setupDumbZoneCommands(pi);
}
