/**
 * defaults:update command
 *
 * Checks for updates to pinned packages and displays a selector UI.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { selectUpdates } from "../components/update-selector";
import { applyUpdates } from "../lib/update";

export function registerDefaultsUpdateCommand(pi: ExtensionAPI): void {
  pi.registerCommand("defaults:update", {
    description: "Check for pinned package updates and apply selected ones",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("defaults:update requires interactive mode", "error");
        return;
      }

      const selection = await selectUpdates(ctx);

      if (!selection || !selection.confirmed) {
        return;
      }

      if (selection.selected.length === 0) {
        ctx.ui.notify("No updates selected", "info");
        return;
      }

      ctx.ui.notify(
        `Applying ${selection.selected.length} update(s)...`,
        "info",
      );

      const result = await applyUpdates(selection.selected);

      for (const error of result.errors) {
        ctx.ui.notify(error, "error");
      }

      if (result.success.length > 0) {
        ctx.ui.notify(
          `Updated ${result.success.length} package(s):\n${result.success.join("\n")}`,
          "info",
        );
      }
    },
  });
}
