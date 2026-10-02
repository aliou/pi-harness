type ReasoningSummary = "auto" | "concise" | "detailed" | "off" | "on";

interface OpenAIReasoning {
  effort?: string;
  summary?: ReasoningSummary | null;
}

export interface OpenAIResponsesPayload {
  reasoning?: OpenAIReasoning;
  [key: string]: unknown;
}

/**
 * Request detailed reasoning summaries on every Responses-API call that
 * carries a `reasoning` object (i.e. reasoning effort was requested). Pi
 * defaults `summary` to "auto"; "detailed" yields the longer thinking blocks.
 * Only Responses-API payloads have this shape, so no model-id check is
 * needed.
 */
export function injectDetailedReasoningSummary(
  payload: OpenAIResponsesPayload,
): OpenAIResponsesPayload {
  if (!payload.reasoning) {
    return payload;
  }

  return {
    ...payload,
    reasoning: {
      ...payload.reasoning,
      summary: "detailed",
    },
  };
}
