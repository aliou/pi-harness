import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { debugNotify } from "../lib/debug";
import {
  applyMode,
  getLastModeFromBranch,
  restoreModeForSession,
} from "../lib/mode-lifecycle";
import { sendModeSwitchMessage } from "../lib/mode-switch";
import { getCurrentMode } from "../state";

export function setupSessionSyncHooks(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (_event, ctx) => {
    const restored = getLastModeFromBranch(ctx);
    if (restored && restored !== getCurrentMode().name) {
      const from = getCurrentMode().name;
      debugNotify(
        ctx,
        `before_agent_start sync from branch: ${from} -> ${restored}`,
      );
      await applyMode(pi, ctx, restored, { silent: true });
      sendModeSwitchMessage(
        pi,
        { mode: restored, from },
        `Synced to ${restored.toUpperCase()} mode.`,
      );
      ctx.ui.notify(`Restored mode: ${restored}`, "info");
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    debugNotify(ctx, "event: session_start");
    await restoreModeForSession(pi, ctx, true);
  });

  pi.on("session_switch", async (_event, ctx) => {
    debugNotify(ctx, "event: session_switch");
    await restoreModeForSession(pi, ctx, false);
  });
}
