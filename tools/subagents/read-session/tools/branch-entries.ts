import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  getBranchEntries,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const branchEntries = defineTool({
  name: "get_branch_entries",
  label: "Get Branch Entries",
  description:
    "Get compact entries from the main branch, or from a branch ending at a specific leaf id. Returns previews only.",
  promptSnippet:
    "Compact entries from the main branch (or a branch ending at a leaf)",
  promptGuidelines: [
    "Use get_branch_entries with fromEnd and a small limit for latest/current questions.",
    "Prefer the main branch; use full-tree tools only for alternate-branch questions.",
  ],
  parameters: Type.Object({
    leafId: Type.Optional(Type.String({ description: "Branch leaf entry id" })),
    fromEnd: Type.Optional(
      Type.Boolean({
        description: "Return entries leaf-to-root instead of root-to-leaf",
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum entries to return; defaults to 100",
      }),
    ),
    types: Type.Optional(Type.Array(Type.String())),
    roles: Type.Optional(Type.Array(Type.String())),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = getBranchEntries(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result.entries) }],
      details: result,
    };
  },
});
