/**
 * Lookout subagent types.
 */

import type { BaseSubagentDetails } from "../../lib/types";

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
export interface LookoutDetails extends BaseSubagentDetails {
  /** The search query */
  query: string;
  /** Working directory for relative path display */
  cwd?: string;
}
