/**
 * `@@` session autocomplete provider.
 *
 * On `@@<token>` in the input editor, searches the Sesame index for sessions
 * matching the token (or lists recent sessions for bare `@@`). On accept, the
 * completion inserts `@@<uuid>`. The `@@<uuid>` marker stays in the user
 * message; on each LLM call the `context` event resolves those markers and
 * appends guidance to the referencing user messages so the model knows to call
 * `read_session`. Context changes are non-destructive and never persisted.
 */

import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AD_HEADER_COLLECT_EVENT,
  AD_HEADER_REGISTER_COMPLETION_EVENT,
  once,
} from "@harness/events";
import type { SessionRef } from "@harness/session-store";
import {
  buildSessionRefsContent,
  extractSessionIds,
  messageText,
  resolveSessionRef,
} from "@harness/session-store";
import { createSessionAutocompleteProvider } from "./provider";

export default async function (pi: ExtensionAPI) {
  once(pi, AD_HEADER_COLLECT_EVENT, () => {
    pi.events.emit(AD_HEADER_REGISTER_COMPLETION_EVENT, {
      trigger: "@@",
      description: "reference past session",
    });
  });

  pi.on("session_start", async (_event, ctx) => {
    const currentSessionId = ctx.sessionManager.getSessionId();
    const cwd = ctx.cwd;

    ctx.ui.addAutocompleteProvider((current) =>
      createSessionAutocompleteProvider(current, cwd, currentSessionId),
    );
  });

  // If the last message references `@@<uuid>` sessions, append guidance so the
  // model knows to call read_session. Re-applied before every LLM call.
  pi.on("context", async (event) => {
    const last = event.messages.at(-1);
    if (last?.role !== "user") return;

    const ids = extractSessionIds(messageText(last.content));
    if (ids.length === 0) return;

    const resolved = await Promise.all(ids.map((id) => resolveSessionRef(id)));
    const refs = resolved.filter((ref): ref is SessionRef => ref != null);
    if (refs.length === 0) return;

    appendGuidance(last, buildSessionRefsContent(refs));
    return { messages: event.messages };
  });
}

/** Append a text guidance block to a user message (mutates the deep copy). */
function appendGuidance(message: UserMessage, guidance: string) {
  if (typeof message.content === "string") {
    message.content = `${message.content}\n\n${guidance}`;
  } else if (Array.isArray(message.content)) {
    message.content = [...message.content, { type: "text", text: guidance }];
  }
}
