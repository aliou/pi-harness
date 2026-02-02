/**
 * Worker subagent types.
 */

import type { SubagentToolCall, SubagentUsage } from "../../lib/types";

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
export interface WorkerDetails {
  /** Short task description (display only) */
  task: string;
  /** Full instructions sent to the worker */
  instructions: string;
  /** Files the worker is operating on */
  files: string[];
  /** Context input */
  context?: string;
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
  /** The worker's response (for final result) */
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
