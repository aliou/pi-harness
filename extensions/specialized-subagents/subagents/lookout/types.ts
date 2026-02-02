/**
 * Lookout subagent types.
 */

import type { SubagentToolCall, SubagentUsage } from "../../lib/types";

/** Input parameters for the lookout subagent */
export interface LookoutInput {
  /** Search query describing what to find */
  query: string;
  /** Optional working directory (defaults to current project cwd) */
  cwd?: string;
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for lookout tool rendering */
export interface LookoutDetails {
  /** The search query */
  query: string;
  /** Requested skill names (from input) */
  skills?: string[];
  /** Number of skills successfully resolved */
  skillsResolved?: number;
  /** Skill names that were not found */
  skillsNotFound?: string[];
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

  /** Resolved model used for this run (provider + model id) */
  resolvedModel?: { provider: string; id: string };
  /** Working directory for relative path display */
  cwd?: string;
}
