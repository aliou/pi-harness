import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands";
import { cacheBasePrompt, resetBasePrompt } from "./lib/prompt-cache";

export default async function (pi: ExtensionAPI) {
  registerCommands(pi);

  // Cache the base system prompt before extensions modify it.
  pi.on("session_start", (_event, ctx) => {
    cacheBasePrompt(ctx.getSystemPrompt());
  });

  // Reset cache on session switch so we re-capture the new base.
  pi.on("session_switch", () => {
    resetBasePrompt();
  });
}
