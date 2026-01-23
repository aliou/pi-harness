/**
 * Notification Hook
 *
 * Emits notification events on certain agent events.
 * The actual OSC sequences and sounds are handled by the presenter extension.
 */

import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ToolCallEvent,
} from "@mariozechner/pi-coding-agent";

// Event channel for notifications
const NOTIFICATION_EVENT = "ad:notification";

interface NotificationEvent {
  message: string;
  sound?: string;
}

const DEFAULT_SOUND = "/System/Library/Sounds/Blow.aiff";
const ATTENTION_SOUND = "/System/Library/Sounds/Ping.aiff";

type ToolCallHandler = (
  pi: ExtensionAPI,
  event: ToolCallEvent,
) => string | undefined;
type ToolResultHandler = (
  pi: ExtensionAPI,
  event: ToolResultMessage,
) => string | undefined;

interface ToolStartNotification {
  toolName: string;
  trigger: "start";
  sound?: string;
  handler: ToolCallHandler;
}

interface ToolEndNotification {
  toolName: string;
  trigger: "end";
  sound?: string;
  handler: ToolResultHandler;
}

type ToolNotification = ToolStartNotification | ToolEndNotification;

const TOOL_NOTIFICATIONS: ToolNotification[] = [
  {
    toolName: "ask_user",
    trigger: "start",
    sound: ATTENTION_SOUND,
    handler: () => "Waiting for user input",
  },
];

/**
 * Emit a notification event
 */
function emitNotification(pi: ExtensionAPI, message: string, sound?: string) {
  const event: NotificationEvent = { message, sound };
  pi.events.emit(NOTIFICATION_EVENT, event);
}

export function setupNotificationHook(pi: ExtensionAPI) {
  let loopCount = 0;
  let toolCallCount = 0;
  let hadError = false;

  const startNotifications = TOOL_NOTIFICATIONS.filter(
    (n): n is ToolStartNotification => n.trigger === "start",
  );
  const endNotifications = TOOL_NOTIFICATIONS.filter(
    (n): n is ToolEndNotification => n.trigger === "end",
  );

  pi.on("tool_call", async (event) => {
    toolCallCount++;

    const notification = startNotifications.find(
      (n) => n.toolName === event.toolName,
    );
    if (notification) {
      const message = notification.handler(pi, event);
      if (message) {
        emitNotification(pi, message, notification.sound);
      }
    }

    return undefined;
  });

  pi.on("turn_end", async (event) => {
    loopCount++;

    for (const result of event.toolResults) {
      if (result.isError) hadError = true;

      const notification = endNotifications.find(
        (n) => n.toolName === result.toolName,
      );
      if (notification) {
        const message = notification.handler(pi, result);
        if (message) {
          emitNotification(pi, message, notification.sound);
        }
      }
    }
  });

  pi.on("agent_end", async () => {
    const wasRunning = loopCount > 0;

    if (wasRunning) {
      const status = hadError ? "with errors" : "done";
      const message = `${status} - ${loopCount} loops, ${toolCallCount} tools`;
      emitNotification(pi, message, DEFAULT_SOUND);
    }

    // Reset counters for next run
    loopCount = 0;
    toolCallCount = 0;
    hadError = false;
  });
}

// Export for use by other extensions (e.g., guardrails)
export { emitNotification, NOTIFICATION_EVENT, ATTENTION_SOUND };
