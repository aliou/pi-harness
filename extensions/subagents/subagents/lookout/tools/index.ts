/**
 * Lookout tools aggregator.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

/** Create all custom tools for the Lookout subagent */
// biome-ignore lint/suspicious/noExplicitAny: ToolDefinition requires any for generic tool arrays
export function createLookoutTools(_cwd: string): ToolDefinition<any, any>[] {
  return [];
}
