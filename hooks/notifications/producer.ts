/**
 * Notification intent producer.
 *
 * Tracks agent runs and emits the canonical `ad:notify:*` events. Other
 * hooks and surfaces (terminal, sound, herdr) consume these events without
 * producing their own notification state.
 */

import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  AD_NOTIFY_DONE_EVENT,
  type AdNotifyDoneEvent,
} from "@harness/events";

type ToolCallHandler = (
  event: ToolCallEvent,
  ctx: ExtensionContext,
) => string | undefined;
type ToolResultHandler = (
  event: ToolResultMessage,
  ctx: ExtensionContext,
) => string | undefined;

interface ToolStartNotification {
  toolName: string;
  trigger: "start";
  handler: ToolCallHandler;
}

interface ToolEndNotification {
  toolName: string;
  trigger: "end";
  handler: ToolResultHandler;
}

type ToolNotification = ToolStartNotification | ToolEndNotification;

/**
 * Find the last assistant message's stopReason in an event's messages array.
 * Returns the raw string (e.g. "stop", "aborted", "error") or undefined.
 */
function lastAssistantStopReason(event: AgentEndEvent): string | undefined {
  const { messages } = event;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;

    return message.stopReason;
  }

  return undefined;
}

function isAgentRunAborted(event: AgentEndEvent): boolean {
  const stopReason = lastAssistantStopReason(event);
  return stopReason?.toLowerCase() === "aborted";
}

/**
 * An agent-level error means the last assistant message ended with
 * stopReason "error" (provider/LLM failure). This is distinct from a
 * tool-result error tracked via hadError, which only marks individual
 * tool calls that failed but still let the turn complete normally.
 */
function isAgentRunErrored(event: AgentEndEvent): boolean {
  return lastAssistantStopReason(event)?.toLowerCase() === "error";
}

function summarizeDone(
  errored: boolean,
  loopCount: number,
  toolCallCount: number,
): string {
  return `${errored ? "with errors" : "done"} - ${loopCount} loops, ${toolCallCount} tools`;
}

export interface ProducerEvents {
  notifyDone(event: AdNotifyDoneEvent): void;
  notifyAttention(event: {
    source?: string;
    description?: string;
    reason?: string;
    toolName?: string;
    toolCallId?: string;
  }): void;
}

export function createProducer(events: ProducerEvents) {
  let loopCount = 0;
  let toolCallCount = 0;
  let agentMessageErrored = false;

  const startNotifications = TOOL_NOTIFICATIONS.filter(
    (n): n is ToolStartNotification => n.trigger === "start",
  );
  const endNotifications = TOOL_NOTIFICATIONS.filter(
    (n): n is ToolEndNotification => n.trigger === "end",
  );

  function onToolCall(event: ToolCallEvent, ctx: ExtensionContext): void {
    toolCallCount++;

    const notification = startNotifications.find(
      (n) => n.toolName === event.toolName,
    );
    if (!notification) return;

    const message = notification.handler(event, ctx);
    if (!message) return;

    events.notifyAttention({
      source: "notifications:producer",
      description: message,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
    });
  }

  function onToolResults(
    toolResults: readonly ToolResultMessage[],
    ctx: ExtensionContext,
  ): void {
    for (const result of toolResults) {
      const notification = endNotifications.find(
        (n) => n.toolName === result.toolName,
      );
      if (!notification) continue;

      const message = notification.handler(result, ctx);
      if (!message) return;

      events.notifyAttention({
        source: "notifications:producer",
        description: message,
        toolName: result.toolName,
        toolCallId: result.toolCallId,
      });
    }
  }

  function onMessageEnd(message: { stopReason?: string }): void {
    if (message.stopReason === "error") {
      agentMessageErrored = true;
    }
  }

  function onTurnEnd(event: {
    toolResults: readonly ToolResultMessage[];
    ctx: ExtensionContext;
  }): void {
    loopCount++;
    onToolResults(event.toolResults, event.ctx);
  }

  function onAgentEnd(event: AgentEndEvent): AdNotifyDoneEvent | undefined {
    const wasRunning = loopCount > 0;
    const wasAborted = isAgentRunAborted(event);

    let doneEvent: AdNotifyDoneEvent | undefined;

    if (wasRunning && !wasAborted) {
      // Provider/LLM-level failure (stopReason="error") is an agent-level
      // error, distinct from an individual tool call returning isError.
      const errored = agentMessageErrored || isAgentRunErrored(event);
      const status = errored ? "error" : "ok";
      const summary = summarizeDone(errored, loopCount, toolCallCount);
      doneEvent = {
        status,
        loops: loopCount,
        toolCalls: toolCallCount,
        summary,
      };
      events.notifyDone(doneEvent);
    }

    // Reset counters for next run
    loopCount = 0;
    toolCallCount = 0;
    agentMessageErrored = false;

    return doneEvent;
  }

  return {
    onToolCall,
    onTurnEnd,
    onMessageEnd,
    onAgentEnd,
  };
}

const TOOL_NOTIFICATIONS: ToolNotification[] = [
  {
    toolName: "ask_user",
    trigger: "start",
    handler: () => "Ask user question",
  },
];

export function setupNotificationProducer(pi: ExtensionAPI): void {
  const producer = createProducer({
    notifyDone: (event) => pi.events.emit(AD_NOTIFY_DONE_EVENT, event),
    notifyAttention: (event) =>
      pi.events.emit(AD_NOTIFY_ATTENTION_EVENT, event),
  });

  pi.on("tool_call", async (event, ctx) => {
    producer.onToolCall(event, ctx);
  });

  pi.on("turn_end", async (event, ctx) => {
    producer.onTurnEnd({ toolResults: event.toolResults, ctx });
  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;
    producer.onMessageEnd(event.message);
  });

  pi.on("agent_end", async (event) => {
    producer.onAgentEnd(event);
  });
}
