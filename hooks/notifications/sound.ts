/**
 * Sound consumer for harness notification events.
 *
 * Maps canonical `ad:notify:*` events to macOS alert sounds and plays them
 * via the native `play-alert-sound` binary. Visual delivery is handled
 * elsewhere. When Pi runs inside Herdr, herdr-cast owns desktop notification
 * sounds so visual and audible delivery stay together and do not double-play.
 */

import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type AlertSound, playSoundFile } from "@harness/audio-player";
import { selectAlertSound, setupSoundEvents } from "./sound-events";

const LEGACY_SOUND_PATHS = {
  attention: "/System/Library/Sounds/Glass.aiff",
  success: "/System/Library/Sounds/Funk.aiff",
  error: "/System/Library/Sounds/Basso.aiff",
} as const satisfies Record<AlertSound, string>;

export function selectSoundPath(
  eventName: string,
  payload?: { status?: "ok" | "error" },
): string | undefined {
  const sound = selectAlertSound(eventName, payload);
  return sound ? LEGACY_SOUND_PATHS[sound] : undefined;
}

// Path to the native binary (resolved relative to this file)
export const PLAY_ALERT_SOUND_BINARY = fileURLToPath(
  new URL("../../bin/play-alert-sound", import.meta.url),
);

/**
 * Play a notification sound (macOS only, best-effort).
 */
export async function playSound(
  exec: ExtensionAPI["exec"],
  soundPath: string,
): Promise<void> {
  await playSoundFile(exec, soundPath, {
    prependBinaries: [PLAY_ALERT_SOUND_BINARY],
  });
}

/**
 * Register the sound consumer. Each notification event results in exactly
 * one sound regardless of whether a visual banner is also produced.
 */
export function setupSoundConsumer(pi: ExtensionAPI): () => void {
  if (process.env.HERDR_ENV === "1") return () => {};
  if (process.env.TERM_PROGRAM === "rex") return () => {};

  return setupSoundEvents(pi, [PLAY_ALERT_SOUND_BINARY]);
}
