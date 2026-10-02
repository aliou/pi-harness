/**
 * Continue command - /continue
 *
 * Switches to the most recent previous session for the current working directory.
 * If already in the most recent session, notifies the user.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  pi.registerCommand("continue", {
    description:
      "Switch to the most recent session for the current working directory",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("continue requires interactive mode", "error");
        return;
      }

      const cwd = ctx.cwd;
      const currentSessionId = ctx.sessionManager.getSessionId();

      const sessions = await SessionManager.list(cwd);

      if (sessions.length === 0) {
        ctx.ui.notify("No previous sessions found for this directory", "info");
        return;
      }

      // Find the most recent session that isn't the current one.
      const target = sessions.find((s) => s.id !== currentSessionId);

      if (!target) {
        ctx.ui.notify("Already in the most recent session", "info");
        return;
      }

      const result = await ctx.switchSession(target.path);

      if (result.cancelled) {
        ctx.ui.notify("Session switch cancelled", "info");
      }
    },
  });
}
