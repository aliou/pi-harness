import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { toggleWidgetVisibility } from "../hooks/usage-bar";

export function setupToggleBarCommand(pi: ExtensionAPI): void {
  pi.registerCommand("usage:toggle-bar", {
    description: "Toggle the usage bar widget",
    handler: async (_args, cmdCtx) => {
      const visible = toggleWidgetVisibility(cmdCtx);
      cmdCtx.ui.notify(`Usage bar ${visible ? "shown" : "hidden"}`, "info");
    },
  });
}
