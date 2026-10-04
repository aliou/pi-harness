import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  getSessionMap,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const sessionMap = defineTool({
  name: "get_session_map",
  label: "Get Session Map",
  description:
    "Get a compact orientation map for a Pi session tree: main leaf, branch leaves, recent entries per branch, and checkpoint previews.",
  promptSnippet:
    "Compact session-tree map with branch leaves, recent branch entries, and checkpoints",
  promptGuidelines: [
    "Start with get_session_map when branch structure, compactions, final state, or alternate branches may matter.",
    "Pi sessions are trees, not flat logs; use the map to choose the right branch leaf before range reads.",
  ],
  parameters: Type.Object({
    maxBranches: Type.Optional(
      Type.Number({
        description: "Maximum branch leaves to return; defaults to 12",
      }),
    ),
    maxCheckpoints: Type.Optional(
      Type.Number({
        description: "Maximum checkpoint previews; defaults to 20",
      }),
    ),
    maxRecentPerBranch: Type.Optional(
      Type.Number({
        description: "Recent compact entries per branch leaf; defaults to 3",
      }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = getSessionMap(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
    };
  },
});
