import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  getTreeOutline,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const treeOutline = defineTool({
  name: "get_tree_outline",
  label: "Get Tree Outline",
  description:
    "Get a bounded flat outline of the session tree. Returns previews only.",
  promptSnippet: "Bounded flat outline of the session tree",
  promptGuidelines: [
    "Avoid get_tree_outline for large sessions unless branch structure matters; set a small limit and maxDepth.",
  ],
  parameters: Type.Object({
    rootId: Type.Optional(
      Type.String({ description: "Entry id to use as the outline root" }),
    ),
    maxDepth: Type.Optional(
      Type.Number({
        description: "Maximum child depth to include; defaults to 4",
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum entries to return; defaults to 200",
      }),
    ),
    mainBranchOnly: Type.Optional(
      Type.Boolean({
        description: "Return only the main branch as a flat outline",
      }),
    ),
    fromEnd: Type.Optional(
      Type.Boolean({
        description: "For mainBranchOnly, return newest entries first",
      }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = getTreeOutline(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result.entries) }],
      details: result,
    };
  },
});
