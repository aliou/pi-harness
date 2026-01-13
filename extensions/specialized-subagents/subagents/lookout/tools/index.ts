/**
 * Lookout tools aggregator.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { createSemanticSearchTool } from "./semantic-search";

/** Create all custom tools for the Lookout subagent */
// biome-ignore lint/suspicious/noExplicitAny: ToolDefinition requires any for generic tool arrays
export function createLookoutTools(): ToolDefinition<any, any>[] {
  return [createSemanticSearchTool()];
}
