import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AD_EDITOR_STASH_CHANGED_EVENT,
  type AdEditorStashChangedEvent,
} from "@harness/events";
import {
  determineAction,
  getStashContent,
  isLastEntryStashWithContent,
} from "./lib";

const STASH_CUSTOM_TYPE = "editor-stash";

function emitStashState(pi: ExtensionAPI, hasContent: boolean): void {
  pi.events.emit(AD_EDITOR_STASH_CHANGED_EVENT, {
    hasContent,
  } satisfies AdEditorStashChangedEvent);
}

export default function editorStashHook(pi: ExtensionAPI): void {
  pi.registerShortcut("ctrl+shift+s", {
    description: "Stash/unstash editor content",
    handler: async (ctx) => {
      const editorText = ctx.ui.getEditorText();
      const stashContent = getStashContent(ctx.sessionManager.getEntries());

      const action = determineAction(
        editorText.length > 0,
        stashContent !== null,
      );

      switch (action) {
        case "stash":
          ctx.ui.setEditorText("");
          pi.appendEntry(STASH_CUSTOM_TYPE, { content: editorText });
          emitStashState(pi, true);
          ctx.ui.notify("stash: editor content stashed", "info");
          break;

        case "pop": {
          const content = stashContent ?? "";
          ctx.ui.setEditorText(content);
          pi.appendEntry(STASH_CUSTOM_TYPE, { content: null });
          emitStashState(pi, false);
          ctx.ui.notify("stash: restored to editor", "info");
          break;
        }

        case "insert": {
          const content = stashContent ?? "";
          ctx.ui.pasteToEditor(content);
          pi.appendEntry(STASH_CUSTOM_TYPE, { content: null });
          emitStashState(pi, false);
          ctx.ui.notify("stash: inserted at cursor", "info");
          break;
        }

        case "empty-warn":
          ctx.ui.notify("stash is empty", "info");
          break;
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    emitStashState(pi, isLastEntryStashWithContent(entries));
  });
}
