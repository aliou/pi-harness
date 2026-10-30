/**
 * Terminal visual consumer for harness notification events.
 *
 * Listens to the canonical `ad:notify:*` events and writes terminal OSC
 * notification sequences. This consumer intentionally never plays sounds;
 * sound delivery lives in `sound.ts`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  AD_NOTIFY_DANGEROUS_EVENT,
  AD_NOTIFY_DONE_EVENT,
  type AdNotifyAttentionEvent,
  type AdNotifyDangerousEvent,
  type AdNotifyDoneEvent,
} from "@harness/events";
import { isManagedTerminal } from "./host";

const TITLE = "Pi";

/**
 * Determine whether terminal OSC effects should be emitted.
 *
 * Inside Herdr or Rex, the terminal owns the desktop notification surface,
 * so Pi should not write OSC sequences. Elsewhere, Pi writes OSC on real
 * terminals and lets the terminal/ compositor decide whether to show a
 * banner for a focused window.
 */
export function shouldUseTerminalEffects(
  env: NodeJS.ProcessEnv,
  stdoutIsTTY: boolean,
): boolean {
  if (isManagedTerminal(env)) return false;
  return stdoutIsTTY;
}

/**
 * Build the terminal OSC sequences for a notification message.
 *
 * - OSC 9: Ghostty, ConEmu
 * - OSC 777: iTerm2, WezTerm, Kitty
 */
export function buildOscSequences(title: string, message: string): string[] {
  return [
    `\x1b]9;${title}: ${message}\x1b\\`,
    `\x1b]777;notify;${title};${message}\x1b\\`,
  ];
}

/**
 * Render a canonical notification event to a plain-text terminal message.
 */
export function renderTerminalMessage(
  eventName: string,
  data: unknown,
): string | undefined {
  if (eventName === AD_NOTIFY_DANGEROUS_EVENT) {
    const event = data as AdNotifyDangerousEvent;
    return `Dangerous command detected: ${event.description}`;
  }

  if (eventName === AD_NOTIFY_ATTENTION_EVENT) {
    const event = data as AdNotifyAttentionEvent;
    return event.description ?? event.reason ?? "Waiting for user input";
  }

  if (eventName === AD_NOTIFY_DONE_EVENT) {
    const event = data as AdNotifyDoneEvent;
    return event.summary ?? "done";
  }

  return undefined;
}

/**
 * Write a notification message to the terminal using OSC sequences.
 */
function deliverToTerminal(message: string): void {
  for (const seq of buildOscSequences(TITLE, message)) {
    process.stdout.write(seq);
  }
}

/**
 * Register the terminal visual consumer.
 */
export function setupTerminalConsumer(pi: ExtensionAPI): () => void {
  const handler = (eventName: string) => (data: unknown) => {
    const env = process.env;
    const stdoutIsTTY = process.stdout.isTTY ?? false;
    if (!shouldUseTerminalEffects(env, stdoutIsTTY)) return;

    const message = renderTerminalMessage(eventName, data);
    if (!message) return;

    deliverToTerminal(message);
  };

  const stopHandles: Array<() => void> = [];

  stopHandles.push(
    pi.events.on(AD_NOTIFY_DANGEROUS_EVENT, handler(AD_NOTIFY_DANGEROUS_EVENT)),
  );
  stopHandles.push(
    pi.events.on(AD_NOTIFY_ATTENTION_EVENT, handler(AD_NOTIFY_ATTENTION_EVENT)),
  );
  stopHandles.push(
    pi.events.on(AD_NOTIFY_DONE_EVENT, handler(AD_NOTIFY_DONE_EVENT)),
  );

  return () => {
    for (const stop of stopHandles) stop();
  };
}
