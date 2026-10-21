import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import { buildPrompt, SCOUT_SYSTEM_PROMPT } from "./prompt";
import { renderScoutDetails, renderScoutHeader } from "./render";
import { createScoutTools } from "./tools";
import { ScoutParams } from "./types";

const extensionPaths = ["./tools/read", "./tools/find"];

export async function registerScout(pi: ExtensionAPI): Promise<void> {
  const tools = createScoutTools(pi);

  const subagent = createSubagent(pi, {
    name: "scout",
    modelPreferences: [{ provider: "agents", model: "scout", thinking: "off" }],
    label: "Scout",
    description:
      "Zero-shot local codebase researcher. Give a scoped query, local cwd/root, relevant symbols/paths, and ask for cited evidence.",
    promptSnippet:
      "Local codebase researcher for scoped code search, architecture tracing, and local git history analysis.",
    promptGuidelines: [
      "scout: Use for local codebase understanding, code search, architecture tracing, and local git history analysis.",
      "scout: Use when the repository or workspace is already available on disk; pass cwd when the target root differs from the current working directory.",
      "scout: Do not use for remote GitHub repositories, web research, simple known-file reads, or exact string searches.",
      "scout: Make the query self-contained: include the exact feature/symbol/behavior, local root, relevant paths/errors, what you know, what to ignore, and desired answer shape.",
      "scout: Ask for file and line-range evidence; for architecture questions, ask for a compact map of modules, responsibilities, call paths, constraints, and verified gaps.",
    ],
    systemPrompt: SCOUT_SYSTEM_PROMPT,
    parameters: ScoutParams,
    resumable: true,
    renderHeader: renderScoutHeader,
    renderDetails: renderScoutDetails,
    buildPrompt,
    resolveCwd: (params, ctx) =>
      params.cwd?.trim() ? path.resolve(ctx.cwd, params.cwd.trim()) : undefined,
    resolveAgentsFiles: (params, ctx) =>
      loadAgentsFilesFromCwd(path.resolve(ctx.cwd, params.cwd?.trim() || ".")),
    tools,
    extensionPaths,
  });

  subagent.register();
}
