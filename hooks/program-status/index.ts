/**
 * Program status (OSC 7501) for `ask_user`.
 *
 * Pi reports its own working, done, error, and idle states with OSC 7501,
 * and reports `blocked` for its built-in dialogs. `ask_user` draws its
 * prompt with `ctx.ui.custom`, which does not report `blocked`, so this hook
 * does it: blocked on the `ask_user` attention event, cleared when the tool
 * call ends. Guardrails reports its own approval prompts.
 *
 * When the last block clears, the hook restores `working` itself because
 * Pi only writes a report when its own state changes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatProgramStatus } from "@earendil-works/pi-tui";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  type AdNotifyAttentionEvent,
} from "@harness/events";
import {
  addBlock,
  askUserBlock,
  type Block,
  currentStatus,
  removeBlock,
  shouldReportProgramStatus,
} from "./blocks";

export default function (pi: ExtensionAPI): void {
  let enabled = false;
  let runActive = false;
  let blocks: readonly Block[] = [];

  function setBlocks(next: readonly Block[]): void {
    if (!enabled || next === blocks) return;
    blocks = next;
    const status = currentStatus(blocks, runActive, pi.getSessionName());
    process.stdout.write(formatProgramStatus(status));
  }

  const stopListening = pi.events.on(AD_NOTIFY_ATTENTION_EVENT, (data) => {
    const block = askUserBlock(data as AdNotifyAttentionEvent);
    if (block) setBlocks(addBlock(blocks, block));
  });

  pi.on("session_start", (_event, ctx) => {
    enabled =
      ctx.mode === "tui" &&
      shouldReportProgramStatus(process.env, process.stdout.isTTY === true);
    runActive = !ctx.isIdle();
  });

  pi.on("agent_start", () => {
    runActive = true;
  });

  pi.on("tool_execution_end", (event) => {
    setBlocks(removeBlock(blocks, event.toolCallId));
  });

  // Pi reports done, error, or idle once the run settles, which replaces any
  // block still shown, so drop the blocks without writing.
  pi.on("agent_settled", () => {
    runActive = false;
    blocks = [];
  });

  pi.on("session_shutdown", () => {
    enabled = false;
    blocks = [];
    stopListening();
  });
}
