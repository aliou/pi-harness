import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  compactEntry,
  createSessionViewFromSession,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const labels = defineTool({
  name: "get_labels",
  label: "Get Labels",
  description:
    "Get active labels as navigation anchors with compact target previews.",
  promptSnippet: "Active labels as navigation anchors",
  promptGuidelines: [
    "Use get_labels when labels are relevant navigation anchors for the goal.",
  ],
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const view = createSessionViewFromSession(sm);
    const { entries } = view;
    const mainBranchIds = view.getMainBranchIds();
    const seen = new Set<string>();

    const result = entries
      .filter((e) => e.type === "label")
      .map((e) => e.targetId)
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return Boolean(view.getLabel(id));
      })
      .map((id) => {
        const entry = view.getEntry(id);
        return {
          targetId: id,
          label: view.getLabel(id),
          target: entry
            ? compactEntry(
                entry,
                view.getLabel(id),
                view.getChildren(id).length,
                mainBranchIds.has(id),
              )
            : undefined,
        };
      });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: { labels: result },
    };
  },
});
