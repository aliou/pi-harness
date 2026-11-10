export const REX_PREFIX = "@rex:";
export const DEBOUNCE_MS = 150;
export const MAX_SUGGESTIONS = 30;

export type RexKind = "session" | "block";

export interface RexSession {
  sessionId: string;
  label: string;
}

export interface RexBlock {
  blockId: string;
  sessionId: string;
  sessionLabel: string;
  windowId: string;
  windowLabel: string;
  blockLabel: string;
  focused: boolean;
}

export interface RexSnapshot {
  sessions: RexSession[];
  blocks: RexBlock[];
}
