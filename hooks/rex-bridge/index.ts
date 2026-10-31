/**
 * Bridge from harness, guardrails, and pi-processes events to the pi-rex
 * contract (`rex:blocked`, `rex:activity:*`). Pi-rex renders those as OSC
 * 7501 child records; this hook only translates event shapes and holds no
 * rendering state.
 *
 * Blocked reports use the reserved `ui-prompt` slot. Both ask_user and
 * guardrails open their prompts with `ctx.ui.custom`, whose generic
 * `ui_prompt_start` record only says "Waiting for input"; claiming the slot
 * replaces that label with the real one instead of adding a second record.
 *
 * Process output changes are intentionally ignored: dev servers and watchers
 * append constantly, and every line would become an OSC write.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  type AdNotifyAttentionEvent,
} from "@harness/events";

const REX_BLOCKED_EVENT = "rex:blocked";
const REX_ACTIVITY_SPAWN_EVENT = "rex:activity:spawn";
const REX_ACTIVITY_END_EVENT = "rex:activity:end";

const UI_PROMPT_SOURCE = "ui-prompt";
const GUARDRAILS_PROMPT_OPENED_EVENT = "guardrails:prompt:opened";
const GUARDRAILS_PROMPT_CLOSED_EVENT = "guardrails:prompt:closed";
const PROCESSES_STARTED_EVENT = "processes:started";
const PROCESSES_ENDED_EVENT = "processes:ended";

interface RexBlockedPayload {
  active: boolean;
  kind?: "permission" | "question" | "auth";
  label?: string;
  source: string;
}

interface RexActivitySpawnPayload {
  id: string;
  title: string;
  app?: string;
}

interface RexActivityEndPayload {
  id: string;
  state: "done" | "error";
  msg?: string;
}

interface GuardrailsPromptOpenedPayload {
  reason?: string;
  prompt?: { id?: string };
}

interface GuardrailsPromptClosedPayload {
  prompt?: { id?: string };
}

interface ProcessInfoPayload {
  id: string;
  name: string;
  exitCode: number | null;
  success: boolean | null;
  errorMessage: string | null;
}

export default function (pi: ExtensionAPI): void {
  let askUserToolCallId: string | undefined;
  const guardrailsPromptIds = new Set<string>();

  const emitBlocked = (payload: RexBlockedPayload): void => {
    pi.events.emit(REX_BLOCKED_EVENT, payload);
  };

  pi.on("session_start", () => {
    askUserToolCallId = undefined;
    guardrailsPromptIds.clear();
  });

  // ask_user: the notification producer already knows the label; claim the
  // slot when the tool call starts and release it when the call ends.
  pi.events.on(AD_NOTIFY_ATTENTION_EVENT, (data) => {
    const event = data as AdNotifyAttentionEvent | undefined;
    if (event?.toolName !== "ask_user") return;
    askUserToolCallId = event.toolCallId;
    emitBlocked({
      active: true,
      kind: "question",
      label: event.description ?? "Ask user question",
      source: UI_PROMPT_SOURCE,
    });
  });

  pi.on("tool_execution_end", (event) => {
    if (!askUserToolCallId || event.toolCallId !== askUserToolCallId) return;
    askUserToolCallId = undefined;
    emitBlocked({ active: false, source: UI_PROMPT_SOURCE });
  });

  // Guardrails: permission prompts can nest, so track the open ids and only
  // release the slot when the last one closes.
  pi.events.on(GUARDRAILS_PROMPT_OPENED_EVENT, (data) => {
    const event = data as GuardrailsPromptOpenedPayload | undefined;
    if (event?.prompt?.id) guardrailsPromptIds.add(event.prompt.id);
    emitBlocked({
      active: true,
      kind: "permission",
      label: event?.reason ?? "Guardrails approval required",
      source: UI_PROMPT_SOURCE,
    });
  });

  pi.events.on(GUARDRAILS_PROMPT_CLOSED_EVENT, (data) => {
    const event = data as GuardrailsPromptClosedPayload | undefined;
    if (event?.prompt?.id) guardrailsPromptIds.delete(event.prompt.id);
    if (guardrailsPromptIds.size > 0) return;
    emitBlocked({ active: false, source: UI_PROMPT_SOURCE });
  });

  // pi-processes: each managed process becomes an activity record; the
  // process name is the title, the outcome lands in the record on end.
  pi.events.on(PROCESSES_STARTED_EVENT, (data) => {
    const event = data as { info?: ProcessInfoPayload } | undefined;
    if (!event?.info) return;
    pi.events.emit(REX_ACTIVITY_SPAWN_EVENT, {
      id: event.info.id,
      title: event.info.name,
      app: "pi",
    } satisfies RexActivitySpawnPayload);
  });

  pi.events.on(PROCESSES_ENDED_EVENT, (data) => {
    const event = data as { info?: ProcessInfoPayload } | undefined;
    if (!event?.info) return;
    const { id, success, exitCode, errorMessage } = event.info;
    const msg =
      errorMessage ?? (exitCode !== null ? `exit ${exitCode}` : undefined);
    pi.events.emit(REX_ACTIVITY_END_EVENT, {
      id,
      state: success === false ? "error" : "done",
      ...(msg !== undefined ? { msg } : {}),
    } satisfies RexActivityEndPayload);
  });
}
