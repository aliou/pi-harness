import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  findEntries as findSessionEntries,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const findEntries = defineTool({
  name: "find_entries",
  label: "Find Entries",
  description:
    "Search entries by text. Defaults to main branch. Returns matching ids and snippets only.",
  promptSnippet: "Search session entries by text (ids + snippets)",
  promptGuidelines: [
    "Use find_entries for keyword goals; it defaults to the main branch and returns snippets only.",
  ],
  parameters: Type.Object({
    query: Type.String(),
    scope: Type.Optional(
      StringEnum(["main_branch", "full_tree"] as const, {
        description: "Search scope. Defaults to the main branch.",
      }),
    ),
    leafId: Type.Optional(
      Type.String({ description: "Search branch ending at this leaf id" }),
    ),
    limit: Type.Optional(Type.Number()),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = findSessionEntries(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result.matches) }],
      details: result,
    };
  },
});
