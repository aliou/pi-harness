import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { addSessionAffinityHeader } from "./anthropic";
import {
  injectDetailedReasoningSummary,
  type OpenAIResponsesPayload,
} from "./openai";
import { addSessionIdHeader } from "./session-id";

export default function (pi: ExtensionAPI): void {
  pi.on("before_provider_headers", (event, ctx) => {
    addSessionIdHeader(event.headers, ctx.sessionManager.getSessionId());

    if (ctx.model?.provider !== "anthropic") return;

    addSessionAffinityHeader(event.headers, ctx.sessionManager.getSessionId());
  });

  pi.on("before_provider_request", (event, ctx) => {
    const provider = ctx.model?.provider;
    if (provider !== "openai" && provider !== "openai-codex") return;

    return injectDetailedReasoningSummary(
      event.payload as OpenAIResponsesPayload,
    );
  });
}
