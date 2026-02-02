/**
 * Reviewer subagent types.
 */

import type { BaseSubagentDetails } from "../../lib/types";

/** Input parameters for the reviewer subagent */
export interface ReviewerInput {
  /** Diff scope to review (e.g., "staged changes", "last commit") */
  diff: string;
  /** Optional focus area: security, performance, style, or general */
  focus?: string;
  /** Optional context about the change intent */
  context?: string;
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for reviewer tool rendering */
export interface ReviewerDetails extends BaseSubagentDetails {
  /** Diff scope */
  diff: string;
  /** Optional focus area */
  focus?: string;
  /** Optional context */
  context?: string;
  /** Working directory for relative path display */
  cwd?: string;
}
