/**
 * Spawn command - /spawn [note]
 *
 * Creates a new session linked to the current one, without context extraction.
 * Optionally accepts a note describing the focus for the new session.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  writeSessionLinkMarker,
  writeSessionLinkSource,
} from "../lib/session-link";

export function setupSpawnCommand(pi: ExtensionAPI) {
  pi.registerCommand("spawn", {
    description:
      "Create a new session linked to the current one (no context extraction)",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("spawn requires interactive mode", "error");
        return;
      }

      const note = args.trim() || "";
      const parentSessionId = ctx.sessionManager.getSessionId() ?? "unknown";
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      const result = await ctx.newSession({
        parentSession: currentSessionFile,
        setup: async (sm) => {
          const newSessionId = sm.getSessionId();
          if (currentSessionFile && newSessionId) {
            writeSessionLinkMarker(
              currentSessionFile,
              newSessionId,
              note,
              "continue",
            );
          }
          writeSessionLinkSource(sm, parentSessionId, note, "continue");
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("Session creation cancelled", "info");
        return;
      }

      if (note) {
        ctx.ui.setEditorText(note);
      }
    },
  });
}
