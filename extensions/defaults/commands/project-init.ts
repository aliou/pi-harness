/**
 * /project:init command.
 *
 * Shows a multi-step wizard to configure packages, skills, and AGENTS.md
 * for the current project.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";
import { buildAgentsPrompt } from "./project-init/agents-prompt";
import {
  applySelections,
  getInstalled,
  readSettings,
} from "./project-init/installer";
import { buildNixPrompt } from "./project-init/nix";
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

      const result = await showWizard(
        ctx,
        config.catalog,
        config.catalogDepth,
        config.childProjectDepth,
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

      // Build combined prompt for nix + AGENTS.md generation
      const promptParts: string[] = [];

      if (result.nixChoice !== "skip") {
        promptParts.push(buildNixPrompt(result.nixChoice, result.stack));
      }

      if (result.generateAgents && result.agentsDirs.length > 0) {
        promptParts.push(
          buildAgentsPrompt(
            result.stack,
            result.selectedEntries,
            result.agentsDirs,
          ),
        );
      }

      if (promptParts.length > 0) {
        pi.sendUserMessage(promptParts.join("\n\n---\n\n"));
      }
    },
  });
}
