/**
 * Reviewer subagent types.
 */

import type { SubagentToolCall, SubagentUsage } from "../../lib/types";

/** Input parameters for the reviewer subagent */
export interface ReviewerInput {
  /** Diff scope to review (e.g., "staged changes", "last commit") */
  diff: string;
  /** Optional focus area: security, performance, style, or general */
  focus?: string;
  /** Optional context about the change intent */
  context?: string;
}

/** Details structure for reviewer tool rendering */
export interface ReviewerDetails {
  /** Diff scope */
  diff: string;
  /** Optional focus area */
  focus?: string;
  /** Optional context */
  context?: string;
  /** Tool calls made by the subagent */
  toolCalls: SubagentToolCall[];
  /** Current spinner frame for animation */
  spinnerFrame: number;
  /** The review response (for final result) */
  response?: string;
  /** Whether the request was aborted */
  aborted?: boolean;
  /** Error message if failed */
  error?: string;
  /** Usage stats from the subagent */
  usage?: SubagentUsage;
}
