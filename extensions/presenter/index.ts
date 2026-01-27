/**
 * Presenter Extension
 *
 * Handles all terminal-specific output (OSC sequences, sounds) for events
 * emitted by other extensions. Only active in UI mode (hasUI === true).
 *
 * This decouples "intent to present" from "presentation mechanism", allowing
 * other extensions to emit events without worrying about RPC vs interactive mode.
 */

import { exec } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Event channels (duplicated from source hooks for decoupling)
const TERMINAL_TITLE_EVENT = "ad:terminal-title";
const NOTIFICATION_EVENT = "ad:notification";
const GUARDRAILS_DANGEROUS_EVENT = "guardrails:dangerous";

interface TerminalTitleEvent {
  title: string;
}

interface NotificationEvent {
  message: string;
  sound?: string;
}

interface GuardrailsDangerousEvent {
  command: string;
  description: string;
  pattern: string;
}

/**
 * Set the terminal title using OSC sequence.
 * Parameter 0 sets both icon and window title.
 *
 * OSC Sequence Format:
 *   ESC ] Ps ; Pt BEL
 *
 * Where:
 *   - ESC = \x1b (escape character)
 *   - ]   = OSC introducer
 *   - Ps  = parameter: 0 (icon+title), 1 (icon only), 2 (title only)
 *   - ;   = separator
 *   - Pt  = title text
 *   - BEL = \x07 (bell character, terminates sequence)
 */
function setTerminalTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`);
}

/**
 * Send terminal notification using OSC escape sequences.
 * OSC 9: Ghostty, ConEmu
 * OSC 777: iTerm2, WezTerm, Kitty
 */
function sendSystemNotification(message: string) {
  const title = "Pi";
  process.stdout.write(`\x1b]9;${title}: ${message}\x1b\\`);
  process.stdout.write(`\x1b]777;notify;${title};${message}\x1b\\`);
}

/**
 * Play notification sound (macOS only)
 */
function playSound(soundPath: string) {
  if (process.platform !== "darwin") return;

  try {
    exec(`afplay "${soundPath}"`);
  } catch {
    // Silently ignore sound playback errors
  }
}

export default function (pi: ExtensionAPI) {
  // Track UI mode - will be set on session_start
  let hasUI = false;

  // Detect UI mode on session start
  pi.on("session_start", async (_event, ctx) => {
    hasUI = ctx.hasUI;
  });

  // Subscribe to terminal title events
  pi.events.on(TERMINAL_TITLE_EVENT, (data: unknown) => {
    if (!hasUI) return;

    const event = data as TerminalTitleEvent;
    setTerminalTitle(event.title);
  });

  // Subscribe to notification events
  pi.events.on(NOTIFICATION_EVENT, (data: unknown) => {
    if (!hasUI) return;

    const event = data as NotificationEvent;
    sendSystemNotification(event.message);
    if (event.sound) {
      playSound(event.sound);
    }
  });

  // Subscribe to guardrails dangerous command events
  pi.events.on(GUARDRAILS_DANGEROUS_EVENT, (data: unknown) => {
    if (!hasUI) return;

    const event = data as GuardrailsDangerousEvent;
    const message = `Dangerous command detected: ${event.description}`;
    sendSystemNotification(message);
    playSound("/System/Library/Sounds/Ping.aiff");
  });
}
