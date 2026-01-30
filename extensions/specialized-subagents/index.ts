import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWebFetchTool } from "./lib/tools";
import { createJesterTool, JESTER_GUIDANCE } from "./subagents/jester";
import { createLookoutTool, LOOKOUT_GUIDANCE } from "./subagents/lookout";
import { createOracleTool, ORACLE_GUIDANCE } from "./subagents/oracle";
import { createReviewerTool, REVIEWER_GUIDANCE } from "./subagents/reviewer";
import { createScoutTool, SCOUT_GUIDANCE } from "./subagents/scout";
import { createWorkerTool, WORKER_GUIDANCE } from "./subagents/worker";

/**
 * Specialized Subagents Extension
 *
 * Provides specialized subagents with custom tools:
 * - scout: Web research and GitHub codebase exploration
 * - lookout: Local codebase search by functionality/concept (uses osgrep)
 * - oracle: Expert AI advisor for complex reasoning and planning
 * - reviewer: Code review feedback on diffs
 * - jester: Random data generator (no tools, high variance)
 * - worker: Focused implementation agent for well-defined tasks on specific files
 *
 * Also provides standalone tools:
 * - web_fetch: Fetch URL content as markdown (no LLM)
 */

/** Check required API keys, throw if missing */
function checkApiKeys(): string[] {
  const missing: string[] = [];

  if (!process.env.LINKUP_API_KEY) {
    missing.push("LINKUP_API_KEY");
  }

  if (!process.env.EXA_API_KEY) {
    missing.push("EXA_API_KEY");
  }

  if (!process.env.SCOUT_GITHUB_TOKEN) {
    missing.push("SCOUT_GITHUB_TOKEN");
  }

  return missing;
}

// Collect all subagent guidances
const SUBAGENT_GUIDANCES = [
  SCOUT_GUIDANCE,
  LOOKOUT_GUIDANCE,
  ORACLE_GUIDANCE,
  REVIEWER_GUIDANCE,
  JESTER_GUIDANCE,
  WORKER_GUIDANCE,
];

export default function (pi: ExtensionAPI) {
  // Don't hard-fail extension load on missing API keys.
  // This keeps no-external-deps tools (e.g. jester) easy to test.
  const missing = checkApiKeys();
  if (missing.length > 0) {
    console.warn(
      `specialized-subagents: missing env vars (${missing.join(", ")}). Some tools may fail when invoked.`,
    );
  }

  // Register subagent tools
  pi.registerTool(createScoutTool());
  pi.registerTool(createLookoutTool());
  pi.registerTool(createOracleTool());
  pi.registerTool(createReviewerTool());
  pi.registerTool(createJesterTool());
  pi.registerTool(createWorkerTool());

  // Register standalone tools
  pi.registerTool(createWebFetchTool());

  // Inject subagent guidance into system prompt
  pi.on("before_agent_start", async (event) => {
    const guidance = SUBAGENT_GUIDANCES.join("\n");
    return {
      systemPrompt: `${event.systemPrompt}\n${guidance}`,
    };
  });
}
