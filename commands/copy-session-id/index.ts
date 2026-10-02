import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  pi.registerCommand("copy:session-id", {
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
