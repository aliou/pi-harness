/**
 * Worker subagent types.
 */

import type { BaseSubagentDetails } from "../../lib/types";

/** Input parameters for the worker subagent */
export interface WorkerInput {
  /** Short description of the task (~50 chars, display only, not sent to model) */
  task: string;
  /** Full instructions for the worker */
  instructions: string;
  /** Files the worker should operate on */
  files: string[];
  /** Optional context or background information */
  context?: string;
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for worker tool rendering */
export interface WorkerDetails extends BaseSubagentDetails {
  /** Short task description (display only) */
  task: string;
  /** Full instructions sent to the worker */
  instructions: string;
  /** Files the worker is operating on */
  files: string[];
  /** Context input */
  context?: string;
  /** Working directory for relative path display */
  cwd?: string;
}
