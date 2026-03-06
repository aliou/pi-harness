import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  applyMode,
  getLastModeFromBranch,
  restoreModeForSession,
} from "../lib/mode-lifecycle";
import { sendModeSwitchMessage } from "../lib/mode-switch";
import { clearPreviousModel, getCurrentMode } from "../state";

export function setupSessionSyncHooks(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (_event, ctx) => {
    const restored = getLastModeFromBranch(ctx);
    if (restored && restored !== getCurrentMode().name) {
      clearPreviousModel();
      const from = getCurrentMode().name;
      await applyMode(pi, ctx, restored, { silent: true });
      sendModeSwitchMessage(
        pi,
        { mode: restored, from, model: ctx.model?.id },
        `Synced to ${restored.toUpperCase()} mode.`,
      );
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    await restoreModeForSession(pi, ctx, true);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await restoreModeForSession(pi, ctx, false);
  });
}
