import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  getEntriesBetween,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const entriesBetween = defineTool({
  name: "get_entries_between",
  label: "Get Entries Between",
  description:
    "Get compact entries between two entry ids on the same branch. Returns previews only.",
  promptSnippet: "Compact entries between two ids on the same branch",
  promptGuidelines: [
    "Use get_entries_between to focus on a narrow id range around a relevant checkpoint.",
    "Only call get_entries_between when startId and endId are on the same branch; Pi sessions are trees, not flat logs.",
  ],
  parameters: Type.Object({
    startId: Type.String({ description: "First entry id to include" }),
    endId: Type.Optional(
      Type.String({
        description: "Last entry id to include; defaults to main branch leaf",
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum entries to return; defaults to 100",
      }),
    ),
    fromEnd: Type.Optional(
      Type.Boolean({ description: "Return newest entries first" }),
    ),
    types: Type.Optional(Type.Array(Type.String())),
    roles: Type.Optional(Type.Array(Type.String())),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = getEntriesBetween(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result.entries) }],
      details: result,
    };
  },
});
