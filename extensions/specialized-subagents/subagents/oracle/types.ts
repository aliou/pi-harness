/**
 * Oracle subagent types.
 */

import type { BaseSubagentDetails } from "../../lib/types";

/** Input parameters for the oracle subagent */
export interface OracleInput {
  /** The task/question to consult the Oracle about */
  task: string;
  /** Optional context or background information */
  context?: string;
  /** Optional files to examine */
  files?: string[];
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for oracle tool rendering */
export interface OracleDetails extends BaseSubagentDetails {
  /** Task input */
  task: string;
  /** Context input */
  context?: string;
  /** Files input */
  files?: string[];
}
