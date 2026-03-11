/**
 * Lookout tools aggregator.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { createCodemoggerSearchTool } from "./codemogger-search";

/** Create all custom tools for the Lookout subagent */
// biome-ignore lint/suspicious/noExplicitAny: ToolDefinition requires any for generic tool arrays
export function createLookoutTools(cwd: string): ToolDefinition<any, any>[] {
  return [createCodemoggerSearchTool(cwd)];
}
