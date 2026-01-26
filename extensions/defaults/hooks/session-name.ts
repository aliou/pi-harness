import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { generateTitle, getFirstUserText } from "../lib/title";

interface SessionNameState {
  hasAutoNamed: boolean;
}

export function setupSessionNameHook(pi: ExtensionAPI) {
  const state: SessionNameState = {
    hasAutoNamed: false,
  };

  // Reset state on session start
  pi.on("session_start", async () => {
    state.hasAutoNamed = false;
  });

  // Reset state on session switch
  pi.on("session_switch", async () => {
    state.hasAutoNamed = false;
  });

  // Auto-generate title on first turn end
  pi.on("turn_end", async (_event, ctx) => {
    // Already auto-named this session
    if (state.hasAutoNamed) return;

    // Already has a name
    if (pi.getSessionName()) {
      state.hasAutoNamed = true;
      return;
    }

    const firstUserText = getFirstUserText(ctx);
    if (!firstUserText?.trim()) return;

    try {
      const title = await generateTitle(firstUserText, ctx);
      if (title) {
        pi.setSessionName(title);
        ctx.ui.notify(`Session: ${title}`, "info");
      } else {
        ctx.ui.notify("Failed to generate session title", "error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      ctx.ui.notify(`Title generation error: ${message}`, "error");
    }

    state.hasAutoNamed = true;
  });
}
