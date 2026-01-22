/**
 * List Plans Command
 *
 * Browse, manage, and edit plans.
 *
 * Usage:
 *   /list-plans
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  deletePlan,
  formatDependencyTree,
  listPlans,
  type PlanInfo,
  readPlan,
} from "../lib/plan-utils";

const EDIT_PLANS_PROMPT = `Update the following plan(s) based on this instruction:

{instruction}

<plans>
{plans}
</plans>

Rewrite the plan file(s) with the requested changes. Preserve the overall structure and frontmatter.`;

export function setupListPlansCommand(pi: ExtensionAPI) {
  pi.registerCommand("list-plans", {
    description: "Browse and manage implementation plans",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("list-plans requires interactive mode", "error");
        return;
      }

      await ctx.waitForIdle();
      const cwd = process.cwd();

      // Main loop - keep showing menu until user quits
      let continueLoop = true;
      while (continueLoop) {
        // List available plans
        const plans = await listPlans(cwd);

        if (plans.length === 0) {
          ctx.ui.notify("No plans found in .agents/plans/", "warning");
          return;
        }

        // Format dependency tree for display
        const treeLines = formatDependencyTree(plans);

        // Show dependency tree
        console.log("\n=== Dependency Tree ===");
        for (const line of treeLines) {
          console.log(line);
        }
        console.log(
          "\n● completed  ◐ in-progress  ○ pending  ✗ cancelled/abandoned\n",
        );

        // Build options for selection
        const planOptions = plans.map(
          (p) => `${p.slug} - ${p.date}: ${p.title} [${p.status}]`,
        );

        const actionOptions = ["Select plan(s) to manage →", "Refresh", "Quit"];

        // Main menu
        const mainChoice = await ctx.ui.select("Plans menu:", actionOptions);

        if (!mainChoice || mainChoice === "Quit") {
          continueLoop = false;
          continue;
        }

        if (mainChoice === "Refresh") {
          continue;
        }

        // Select plans
        const selectedOptions: string[] = [];
        let selectingPlans = true;

        while (selectingPlans) {
          const availableOptions = planOptions.filter(
            (opt) => !selectedOptions.includes(opt),
          );

          if (availableOptions.length === 0) {
            ctx.ui.notify("All plans selected", "info");
            selectingPlans = false;
            break;
          }

          const choice = await ctx.ui.select(
            `Selected: ${selectedOptions.length}. Choose plan (or Done):`,
            ["Done", "Cancel", ...availableOptions],
          );

          if (!choice || choice === "Cancel") {
            selectingPlans = false;
            selectedOptions.length = 0;
            break;
          }

          if (choice === "Done") {
            selectingPlans = false;
            break;
          }

          selectedOptions.push(choice);
        }

        if (selectedOptions.length === 0) {
          continue;
        }

        // Map selections back to plans
        const selectedPlans = selectedOptions
          .map((sel) => {
            const idx = planOptions.indexOf(sel);
            return plans[idx];
          })
          .filter((p): p is PlanInfo => p !== undefined);

        // Ask what to do with selected plans
        const action = await ctx.ui.select("Action:", [
          "Execute (first selected only)",
          "Open in nvim",
          "Delete",
          "Edit with prompt",
          "Back",
        ]);

        if (!action || action === "Back") {
          continue;
        }

        switch (action) {
          case "Execute (first selected only)": {
            const plan = selectedPlans[0];
            if (!plan) {
              ctx.ui.notify("No plan selected", "error");
              continue;
            }

            // Delegate to execute-plan flow
            pi.sendUserMessage(`/execute-plan`);
            continueLoop = false;
            break;
          }

          case "Open in nvim": {
            for (const plan of selectedPlans) {
              // Open in nvim
              spawn("nvim", [plan.path], {
                stdio: "inherit",
                cwd,
              });
            }
            ctx.ui.notify(
              `Opened ${selectedPlans.length} plan(s) in nvim`,
              "info",
            );
            break;
          }

          case "Delete": {
            const confirm = await ctx.ui.confirm(
              "Delete plans?",
              `Delete ${selectedPlans.length} plan(s)? This cannot be undone.`,
            );

            if (confirm) {
              for (const plan of selectedPlans) {
                await deletePlan(plan.path);
              }
              ctx.ui.notify(`Deleted ${selectedPlans.length} plan(s)`, "info");
            }
            break;
          }

          case "Edit with prompt": {
            const instruction = await ctx.ui.input(
              "Edit instruction:",
              "What changes to make?",
            );
            if (!instruction) {
              ctx.ui.notify("Cancelled", "info");
              continue;
            }

            // Read all selected plans
            const planContents = await Promise.all(
              selectedPlans.map(async (plan) => {
                const content = await readPlan(plan.path);
                return `<plan path="${plan.path}">\n${content}\n</plan>`;
              }),
            );

            const prompt = EDIT_PLANS_PROMPT.replace(
              "{instruction}",
              instruction,
            ).replace("{plans}", planContents.join("\n\n"));

            pi.sendUserMessage(prompt);
            continueLoop = false;
            break;
          }
        }
      }
    },
  });
}
