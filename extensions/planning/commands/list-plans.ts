/**
 * List Plans Command
 *
 * Lists available plans and provides actions to edit, execute, or archive.
 *
 * Usage:
 *   /plan:list
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { configLoader } from "../lib/config";
import type { ArchiveResult } from "../lib/plan-selector";
import { selectPlan } from "../lib/plan-selector";
import {
  checkDependencies,
  listPlans,
  readPlan,
  updatePlanStatus,
} from "../lib/plan-utils";
import type { PlanInfo } from "../lib/types";

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

/**
 * Archive a plan by moving it to the configured archive directory.
 * If the archive directory is a git repo, stages, commits, and pushes.
 */
async function archivePlan(plan: PlanInfo): Promise<ArchiveResult> {
  await configLoader.load();
  const config = configLoader.getConfig();

  if (!config.archiveDir) {
    return {
      ok: false,
      message:
        "Archive directory not configured. Set archiveDir in ~/.pi/agent/extensions/planning.json",
    };
  }

  const archiveDir = path.resolve(config.archiveDir);
  const filename = path.basename(plan.path);
  const title = plan.title?.trim() || plan.slug || plan.filename;

  try {
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.rename(plan.path, path.join(archiveDir, filename));

    // Check if archive directory is a git repo
    const gitDir = path.join(archiveDir, ".git");
    try {
      await fs.access(gitDir);
    } catch {
      return { ok: true, message: `Archived ${title}` };
    }

    // Git operations
    const git = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: archiveDir,
        encoding: "utf-8",
      });
      return result.status === 0;
    };

    if (!git(["add", filename])) {
      return { ok: true, message: `Archived ${title} (failed to stage)` };
    }

    if (!git(["commit", "-m", `Archive plan: ${filename}`, "--quiet"])) {
      return { ok: true, message: `Archived ${title} (failed to commit)` };
    }

    if (!git(["push", "--quiet"])) {
      return { ok: true, message: `Archived ${title} (failed to push)` };
    }

    return { ok: true, message: `Archived ${title}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Failed to archive: ${msg}` };
  }
}

/**
 * Open a plan in the editor.
 */
async function editPlan(
  planPath: string,
  planTitle: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR;

  if (!editor) {
    ctx.ui.notify("Set $VISUAL or $EDITOR to edit plans", "error");
    return;
  }

  const exitCode = await ctx.ui.custom<number | null>(
    (tui, _theme, _kb, done) => {
      tui.stop();

      const [editorBin, ...editorArgs] = editor.split(" ");
      const result = spawnSync(editorBin ?? editor, [...editorArgs, planPath], {
        stdio: "inherit",
        env: process.env,
      });

      tui.start();
      tui.requestRender(true);

      done(result.status);

      return { render: () => [], invalidate: () => {} };
    },
  );

  // RPC fallback: editor requires interactive TUI
  if (exitCode === undefined) {
    ctx.ui.notify("Editing plans requires interactive mode", "info");
    return;
  }

  if (exitCode !== 0) {
    ctx.ui.notify("Editor exited with errors", "error");
    return;
  }

  ctx.ui.notify(`Closed editor for ${planTitle}`, "info");
}

/**
 * Execute a plan - start the execution flow.
 */
async function executePlan(
  plan: PlanInfo,
  plans: PlanInfo[],
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const planTitle = plan.title?.trim() || plan.slug;

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

  if (planTitle) {
    pi.setSessionName(planTitle);
  }

  await updatePlanStatus(plan.path, "in-progress");

  ctx.ui.setWidget("plan-execution", (_tui, theme) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));
    const header = theme.fg(
      "accent",
      theme.bold(`Executing Plan: ${planTitle}`),
    );
    const pathLine = theme.fg("dim", plan.path);
    container.addChild(new Text(`${header}\n${pathLine}`, 1, 0));
    return container;
  });

  const planContent = await readPlan(plan.path);

  pi.sendUserMessage(
    `${EXECUTE_PLAN_PROMPT}<plan>\n${planContent}\n</plan>\n\nPlan path: ${plan.path}`,
  );
}

export function setupListPlansCommand(pi: ExtensionAPI) {
  pi.registerCommand("plan:list", {
    description: "List plans with options to edit, execute, or archive",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("plan:list requires interactive mode", "error");
        return;
      }

      await ctx.waitForIdle();
      const cwd = process.cwd();

      const plans = await listPlans(cwd);

      if (plans.length === 0) {
        ctx.ui.notify("No plans found in .agents/plans/", "warning");
        return;
      }

      const plan = await selectPlan(ctx, plans, archivePlan);

      if (!plan) {
        return;
      }

      const planTitle = plan.title?.trim() || plan.slug || plan.filename;

      const choice = await ctx.ui.select(
        `What would you like to do with "${planTitle}"?`,
        ["Execute", "Edit"],
      );

      if (choice === undefined) {
        return;
      }

      if (choice === "Execute") {
        await executePlan(plan, plans, ctx, pi);
      } else {
        await editPlan(plan.path, planTitle, ctx);
      }
    },
  });
}
