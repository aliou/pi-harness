/**
 * Save Plan Command
 *
 * Converts the current conversation into a structured implementation plan.
 * The agent figures out everything - name, structure, content.
 *
 * Usage:
 *   /plan:save
 *   /plan:save focus on the error handling approach we discussed
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildSaveAsPlanPrompt } from "../lib/save-plan-prompt";

export function setupSaveAsPlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("plan:save", {
    description: "Create implementation plan from conversation",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      const additionalInstructions = args.trim();
      const currentDate = new Date().toISOString().split("T")[0] ?? "";
      const prompt = buildSaveAsPlanPrompt(currentDate, additionalInstructions);

      pi.sendUserMessage(prompt);
    },
  });
}
