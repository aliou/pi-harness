/**
 * Session start hook - notify about recent plans
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPlans } from "../lib/plan-io";

export function setupSessionStartHook(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const plans = await listPlans(ctx.cwd);
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Filter plans: in current directory, created in past week, not started or in progress
    const recentPlans = plans.filter((plan) => {
      // Check if plan belongs to current directory
      if (plan.directory !== ctx.cwd) return false;

      // Check if created in past week
      const planDate = new Date(plan.date).getTime();
      if (Number.isNaN(planDate) || planDate < oneWeekAgo) return false;

      // Check status
      return plan.status === "pending" || plan.status === "in-progress";
    });

    const notStarted = recentPlans.filter((p) => p.status === "pending").length;
    const inProgress = recentPlans.filter(
      (p) => p.status === "in-progress",
    ).length;

    if (notStarted > 0 || inProgress > 0) {
      const parts: string[] = [];
      if (notStarted > 0) {
        parts.push(
          `${notStarted} plan${notStarted > 1 ? "s" : ""} not started`,
        );
      }
      if (inProgress > 0) {
        parts.push(
          `${inProgress} plan${inProgress > 1 ? "s" : ""} in progress`,
        );
      }
      ctx.ui.notify(`${parts.join(", ")}. Run /plan:list to see them.`, "info");
    }
  });
}
