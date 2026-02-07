/**
 * /project:init command.
 *
 * Shows an interactive wizard that scans catalog/project in background,
 * calls scout for recommendations, and applies selections.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";
import { buildAgentsPrompt } from "./project-init/agents-prompt";
import {
  applySelections,
  getInstalled,
  readSettings,
} from "./project-init/installer";
import { showWizard } from "./project-init/wizard";

export function registerProjectInitCommand(pi: ExtensionAPI): void {
  pi.registerCommand("project:init", {
    description: "Initialize project with skills, packages, and AGENTS.md",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("project:init requires interactive mode", "error");
        return;
      }

      const config = configLoader.getConfig();
      if (config.catalog.length === 0) {
        ctx.ui.notify(
          "No catalog directories configured. Use /defaults:settings to add directories.",
          "warning",
        );
        return;
      }

      // Wizard handles all loading, scanning, and scout calls internally
      const result = await showWizard(
        pi,
        ctx,
        config.catalog,
        config.catalogDepth,
      );

      if (!result) {
        ctx.ui.notify("Project init cancelled", "info");
        return;
      }

      // Apply selections
      if (
        result.selectedEntries.length > 0 ||
        result.unselectedEntries.length > 0
      ) {
        const settings = await readSettings(ctx.cwd);
        const installed = getInstalled(settings);

        await applySelections(
          ctx.cwd,
          result.selectedEntries,
          result.unselectedEntries,
        );

        const added = result.selectedEntries.length;
        const removed = result.unselectedEntries.filter((e) =>
          e.type === "skill"
            ? installed.skills.has(e.path)
            : installed.packages.has(e.path),
        ).length;

        const parts: string[] = [];
        if (added > 0) parts.push(`${added} added`);
        if (removed > 0) parts.push(`${removed} removed`);
        if (parts.length > 0) {
          ctx.ui.notify(`Settings updated: ${parts.join(", ")}`, "info");
        }
      }

      // Generate AGENTS.md via prompt injection
      if (result.generateAgents) {
        const prompt = buildAgentsPrompt(
          result.stack,
          result.selectedEntries,
          result.scoutAnalysis,
        );
        pi.sendUserMessage(prompt);
      }
    },
  });
}
