import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  readEntry as readSessionEntry,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const readEntry = defineTool({
  name: "read_entry",
  label: "Read Entry",
  description:
    "Read content for exactly one session entry by id. Large content is truncated by default.",
  promptSnippet:
    "Read content for one session entry by id (truncated if large)",
  promptGuidelines: [
    "Call read_entry only for entry ids you need to answer; avoid large reads.",
  ],
  parameters: Type.Object({
    id: Type.String({ description: "Entry id" }),
    maxChars: Type.Optional(
      Type.Number({
        description:
          "Maximum serialized content chars to return; defaults to 20000, max 100000",
      }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = readSessionEntry(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result.entry) }],
      details: result,
    };
  },
});
