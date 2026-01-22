import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWebFetchTool } from "./lib/tools";
import { createLookoutTool, LOOKOUT_GUIDANCE } from "./subagents/lookout";
import { createOracleTool, ORACLE_GUIDANCE } from "./subagents/oracle";
import { createReviewerTool, REVIEWER_GUIDANCE } from "./subagents/reviewer";
import { createScoutTool, SCOUT_GUIDANCE } from "./subagents/scout";

/**
 * Specialized Subagents Extension
 *
 * Provides specialized subagents with custom tools:
 * - scout: Web research and GitHub codebase exploration
 * - lookout: Local codebase search by functionality/concept (uses osgrep)
 * - oracle: Expert AI advisor for complex reasoning and planning
 * - reviewer: Code review feedback on diffs
 *
 * Also provides standalone tools:
 * - web_fetch: Fetch URL content as markdown (no LLM)
 */

/** Check required API keys, throw if missing */
function checkApiKeys(): void {
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

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

// Collect all subagent guidances
const SUBAGENT_GUIDANCES = [
  SCOUT_GUIDANCE,
  LOOKOUT_GUIDANCE,
  ORACLE_GUIDANCE,
  REVIEWER_GUIDANCE,
];

export default function (pi: ExtensionAPI) {
  // Check API keys at load time - throws if missing
  checkApiKeys();

  // Register subagent tools
  pi.registerTool(createScoutTool());
  pi.registerTool(createLookoutTool());
  pi.registerTool(createOracleTool());
  pi.registerTool(createReviewerTool());

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
