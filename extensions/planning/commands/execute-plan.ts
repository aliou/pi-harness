/**
 * Execute Plan Command
 *
 * Lists available plans, lets user select one, then starts execution.
 *
 * Usage:
 *   /execute-plan
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPlans, readPlan } from "../lib/plan-utils";

const EXECUTE_PLAN_PROMPT = `Execute the following implementation plan. Follow the Implementation Order section step by step.

As you complete each step:
- Check off completed items in the Implementation Order
- Update the Implementation Progress section with what was done
- If you encounter issues or need to deviate from the plan, note it in Implementation Progress

Here is the plan:

`;

export function setupExecutePlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("execute-plan", {
    description: "Select and execute an implementation plan",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("execute-plan requires interactive mode", "error");
        return;
      }

      await ctx.waitForIdle();
      const cwd = process.cwd();

      // List available plans
      const plans = await listPlans(cwd);

      if (plans.length === 0) {
        ctx.ui.notify("No plans found in .agents/plans/", "warning");
        return;
      }

      // Build selection options: "YYYY-MM-DD: Title"
      const options = plans.map((p) => `${p.date}: ${p.title}`);

      // Let user select
      const selected = await ctx.ui.select(
        "Select a plan to execute:",
        options,
      );

      if (!selected) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Find the selected plan
      const selectedIndex = options.indexOf(selected);
      const plan = plans[selectedIndex];

      // Read the plan
      const planContent = await readPlan(plan.path);

      // Send to agent
      pi.sendUserMessage(
        `${EXECUTE_PLAN_PROMPT}<plan>\n${planContent}\n</plan>\n\nPlan path: ${plan.path}`,
      );
    },
  });
}
