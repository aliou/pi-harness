/**
 * Lookout subagent types.
 */

import type { SubagentToolCall, SubagentUsage } from "../../lib/types";

/** Input parameters for the lookout subagent */
export interface LookoutInput {
  /** Search query describing what to find */
  query: string;
}

/** Details structure for lookout tool rendering */
export interface LookoutDetails {
  /** The search query */
  query: string;
  /** Tool calls made by the subagent */
  toolCalls: SubagentToolCall[];
  /** Current spinner frame for animation */
  spinnerFrame: number;
  /** The lookout's response (for final result) */
  response?: string;
  /** Whether the request was aborted */
  aborted?: boolean;
  /** Error message if failed */
  error?: string;
  /** Usage stats from the subagent */
  usage?: SubagentUsage;
}
