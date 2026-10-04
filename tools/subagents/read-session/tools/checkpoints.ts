import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createSessionViewFromSession,
  getCheckpoints,
  readCheckpoint as readSessionCheckpoint,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

export const checkpoints = defineTool({
  name: "get_checkpoints",
  label: "Get Checkpoints",
  description:
    "Get compact compaction and branch-summary checkpoints. Returns summary previews only.",
  promptSnippet: "Compact compaction and branch-summary checkpoints",
  promptGuidelines: [
    "Call get_checkpoints before broad reads if the overview reports compactions.",
  ],
  parameters: Type.Object({
    fromEnd: Type.Optional(
      Type.Boolean({
        description: "Return newest checkpoints first instead of oldest first",
      }),
    ),
    limit: Type.Optional(Type.Number({ description: "Maximum checkpoints" })),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = getCheckpoints(createSessionViewFromSession(sm), params);

    return {
      content: [{ type: "text", text: JSON.stringify(result.checkpoints) }],
      details: result,
    };
  },
});

export const readCheckpoint = defineTool({
  name: "read_checkpoint",
  label: "Read Checkpoint",
  description:
    "Read the full summary for one compaction or branch-summary entry by id.",
  promptSnippet: "Read the full summary for one checkpoint by id",
  promptGuidelines: [
    "Use read_checkpoint to inspect a checkpoint summary before reading its underlying entries.",
  ],
  parameters: Type.Object({
    id: Type.String({ description: "Checkpoint entry id" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const result = readSessionCheckpoint(
      createSessionViewFromSession(sm),
      params,
    );

    return {
      content: [{ type: "text", text: JSON.stringify(result.checkpoint) }],
      details: result,
    };
  },
});
