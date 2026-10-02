import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  pi.registerCommand("copy:session-path", {
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
}
