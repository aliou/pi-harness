import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyToClipboard } from "@mariozechner/pi-coding-agent";
import { setupContinueCommand } from "./continue";
import { setupHandoffCommand } from "./handoff";
import { setupSpawnCommand } from "./spawn";

export function setupSessionCommands(pi: ExtensionAPI) {
  setupHandoffCommand(pi);
  setupContinueCommand(pi);
  setupSpawnCommand(pi);

  pi.registerCommand("session:copy-path", {
    description: "Copy the current session file path to clipboard",
    handler: async (_args, ctx) => {
      const sessionPath = ctx.sessionManager.getSessionFile();

      if (!sessionPath) {
        ctx.ui.notify("No session file (ephemeral session)", "warning");
        return;
      }

      copyToClipboard(sessionPath);
      ctx.ui.notify(sessionPath, "info");
    },
  });

  pi.registerCommand("session:copy-id", {
    description: "Copy the current session ID to clipboard",
    handler: async (_args, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId();

      if (!sessionId) {
        ctx.ui.notify("No session ID (ephemeral session)", "warning");
        return;
      }

      copyToClipboard(sessionId);
      ctx.ui.notify(sessionId, "info");
    },
  });
}
