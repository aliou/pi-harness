import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getCurrentMode } from "../state";

export function setupSystemPromptHook(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const mode = getCurrentMode();
    if (!mode.instructions) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${mode.instructions}`,
    };
  });
}
