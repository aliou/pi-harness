import type { Usage } from "@earendil-works/pi-ai";
import { withoutUndefined } from "@harness/utils";
import { type Static, Type } from "typebox";
import type { SubagentDetails } from "./types";

/**
 * Default hints for subagent tools: the subagent only runs read-only tools,
 * but it calls model providers and may search or fetch the web.
 */
export const SUBAGENT_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
} as const;

const UsageSchema = Type.Object({
  input: Type.Number(),
  output: Type.Number(),
  cacheRead: Type.Number(),
  cacheWrite: Type.Number(),
  cacheWrite1h: Type.Optional(Type.Number()),
  reasoning: Type.Optional(Type.Number()),
  totalTokens: Type.Number(),
  cost: Type.Object({
    input: Type.Number(),
    output: Type.Number(),
    cacheRead: Type.Number(),
    cacheWrite: Type.Number(),
    total: Type.Number({ description: "USD" }),
  }),
});

/** `structuredContent` of every subagent tool and its `resume_*` tool. */
export const SubagentOutputSchema = Type.Object({
  response: Type.String({
    description: "Final answer of the subagent, without the resume footer",
  }),
  sessionId: Type.String(),
  resumable: Type.Boolean({
    description: "Whether the matching resume_* tool can continue this session",
  }),
  model: Type.Optional(
    Type.Object({
      provider: Type.String(),
      model: Type.String(),
      thinking: Type.String(),
    }),
  ),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("running"),
    Type.Literal("success"),
    Type.Literal("error"),
    Type.Literal("aborted"),
  ]),
  usage: UsageSchema,
});

export type SubagentOutput = Static<typeof SubagentOutputSchema>;

export function buildSubagentOutput(
  details: SubagentDetails,
  resumable: boolean,
): SubagentOutput {
  const { model } = details;
  return withoutUndefined({
    response: details.response ?? "",
    sessionId: details.sessionId,
    resumable,
    model: model
      ? {
          provider: model.provider,
          model: model.model,
          thinking: model.thinking,
        }
      : undefined,
    status: details.status,
    usage: toUsageOutput(details.usage),
  });
}

function toUsageOutput(usage: Usage): Static<typeof UsageSchema> {
  return withoutUndefined({
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    cacheWrite1h: usage.cacheWrite1h,
    reasoning: usage.reasoning,
    totalTokens: usage.totalTokens,
    cost: { ...usage.cost },
  });
}
