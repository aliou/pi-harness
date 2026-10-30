import type { ProgramStatus } from "@earendil-works/pi-tui";
import type { AdNotifyAttentionEvent } from "@harness/events";

const APP = "pi";
const DEFAULT_BLOCKED_LABEL = "Waiting for user input";

/** An open `ask_user` prompt. It clears when its tool call ends. */
export interface Block {
  toolCallId: string;
  label: string;
}

/**
 * Report only to a terminal, and honor Pi's own opt-out. Terminals ignore
 * OSC sequences they do not support, so no terminal check is needed.
 */
export function shouldReportProgramStatus(
  env: NodeJS.ProcessEnv,
  stdoutIsTTY: boolean,
): boolean {
  return stdoutIsTTY && env.PI_PROGRAM_STATUS !== "0";
}

export function askUserBlock(event: AdNotifyAttentionEvent): Block | undefined {
  if (event.toolName !== "ask_user" || !event.toolCallId) return undefined;
  return {
    toolCallId: event.toolCallId,
    label: event.description ?? DEFAULT_BLOCKED_LABEL,
  };
}

export function addBlock(
  blocks: readonly Block[],
  block: Block,
): readonly Block[] {
  const duplicate = blocks.some(
    ({ toolCallId }) => toolCallId === block.toolCallId,
  );
  return duplicate ? blocks : [...blocks, block];
}

export function removeBlock(
  blocks: readonly Block[],
  toolCallId: string,
): readonly Block[] {
  const next = blocks.filter((block) => block.toolCallId !== toolCallId);
  return next.length === blocks.length ? blocks : next;
}

/**
 * The status to report for the current blocks. Without blocks, this restores
 * the state Pi reported before the first block: Pi only writes when its own
 * state changes, so it does not resend `working` after a block clears.
 */
export function currentStatus(
  blocks: readonly Block[],
  runActive: boolean,
  sessionName: string | undefined,
): ProgramStatus {
  const top = blocks.at(-1);
  if (top) {
    return { state: "blocked", kind: "question", app: APP, message: top.label };
  }
  if (runActive) return { state: "working", app: APP, message: sessionName };
  return { state: "idle", app: APP };
}
