/**
 * Scout subagent types.
 */

import type { BaseSubagentDetails } from "../../lib/types";

/** Input parameters for the scout subagent */
export interface ScoutInput {
  /** URL to fetch content from */
  url?: string;
  /** Search query for web or GitHub research */
  query?: string;
  /** GitHub repository to focus on (owner/repo format) */
  repo?: string;
  /** Question to answer based on fetched content */
  prompt: string;
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for scout tool rendering */
export interface ScoutDetails extends BaseSubagentDetails {
  /** URL input */
  url?: string;
  /** Query input */
  query?: string;
  /** Repository input */
  repo?: string;
  /** Prompt input */
  prompt?: string;
}
