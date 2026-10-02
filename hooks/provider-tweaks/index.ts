import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { effectiveModelIdentity } from "@harness/models";
import { addSessionAffinityHeader } from "./anthropic";
import {
  injectDetailedReasoningSummary,
  type OpenAIResponsesPayload,
} from "./openai";
import { addSessionIdHeader } from "./session-id";

/**
 * Provider of the model this request goes to. Under a virtual (alias)
 * selection `ctx.model` is the alias, so resolve the routed physical model
 * from the sticky route state on the session branch.
 */
function requestProvider(ctx: ExtensionContext): string | undefined {
  return effectiveModelIdentity(ctx.model, ctx.sessionManager.getBranch())
    ?.provider;
}

export default function (pi: ExtensionAPI): void {
  pi.on("before_provider_headers", (event, ctx) => {
    addSessionIdHeader(event.headers, ctx.sessionManager.getSessionId());

    if (requestProvider(ctx) !== "anthropic") return;

    addSessionAffinityHeader(event.headers, ctx.sessionManager.getSessionId());
  });

  pi.on("before_provider_request", (event, ctx) => {
    const provider = requestProvider(ctx);
    if (provider !== "openai" && provider !== "openai-codex") return;

    return injectDetailedReasoningSummary(
      event.payload as OpenAIResponsesPayload,
    );
  });
}
