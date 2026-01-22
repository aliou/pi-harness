/**
 * Reviewer tools aggregator.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

/** Create all custom tools for the Reviewer subagent */
// biome-ignore lint/suspicious/noExplicitAny: ToolDefinition requires any for generic tool arrays
export function createReviewerTools(): ToolDefinition<any, any>[] {
  return [];
}
