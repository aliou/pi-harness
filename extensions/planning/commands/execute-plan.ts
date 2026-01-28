/**
 * Execute Plan Command
 *
 * Lists available plans, lets user select one, then starts execution.
 *
 * Usage:
 *   /plan:execute
 */

import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { selectPlan } from "../lib/plan-selector";
import {
  checkDependencies,
  listPlans,
  readPlan,
  updatePlanStatus,
} from "../lib/plan-utils";

/**
 * Check if the current session has any messages (not counting the header).
 */
function hasSessionMessages(ctx: ExtensionCommandContext): boolean {
  const entries = ctx.sessionManager.getEntries();
  return entries.some((e) => e.type === "message");
}

const EXECUTE_PLAN_PROMPT = `Execute the following implementation plan. Follow the Implementation Order section step by step.

As you complete each step:
- Check off completed items in the Implementation Order
- Update the Implementation Progress section with what was done
- If you encounter issues or need to deviate from the plan, note it in Implementation Progress

**When finished:**
- Update the frontmatter \`status\` field to \`completed\`

**If stopping early:**
- Update \`status\` to \`cancelled\` (can resume later) or \`abandoned\` (won't continue)
- Note the reason in Implementation Progress

Here is the plan:

`;

export function setupExecutePlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("plan:execute", {
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

      const plan = await selectPlan(ctx, plans, "Select a plan to execute");

      if (!plan) {
        return;
      }

      const planTitle = plan.title?.trim() || plan.slug || plan.filename;

      // Check dependencies
      const depCheck = checkDependencies(plan, plans);
      if (depCheck.unresolved.length > 0) {
        const unresolvedList = depCheck.unresolved.join(", ");
        const proceed = await ctx.ui.confirm(
          "Unresolved dependencies",
          `The following dependencies are not met:\n${unresolvedList}\n\nProceed anyway?`,
        );

        if (!proceed) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
      }

      // Check if session has messages and ask user where to execute
      if (hasSessionMessages(ctx)) {
        const choice = await ctx.ui.select(
          "Session has existing messages. Where should the plan execute?",
          ["Create new linked session", "Execute in current session"],
        );

        if (choice === undefined) {
          // User cancelled
          return;
        }

        if (choice === "Create new linked session") {
          const parentSession = ctx.sessionManager.getSessionFile();
          const result = await ctx.newSession({ parentSession });
          if (result.cancelled) {
            ctx.ui.notify("New session creation was cancelled", "info");
            return;
          }
        }
      }

      // Set session name (after potential new session creation)
      if (planTitle) {
        pi.setSessionName(planTitle);
      }

      // Update status to in-progress
      await updatePlanStatus(plan.path, "in-progress");

      ctx.ui.setWidget("plan-execution", (_tui, theme) => {
        const container = new Container();
        container.addChild(
          new DynamicBorder((s: string) => theme.fg("muted", s)),
        );
        const header = theme.fg(
          "accent",
          theme.bold(`Executing Plan: ${planTitle}`),
        );
        const pathLine = theme.fg("dim", plan.path);
        container.addChild(new Text(`${header}\n${pathLine}`, 1, 0));
        return container;
      });

      // Read the plan
      const planContent = await readPlan(plan.path);

      // Send to agent
      pi.sendUserMessage(
        `${EXECUTE_PLAN_PROMPT}<plan>\n${planContent}\n</plan>\n\nPlan path: ${plan.path}`,
      );
    },
  });
}
