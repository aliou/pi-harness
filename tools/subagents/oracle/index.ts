import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import { ADVISORY_DISCLAIMER } from "../shared/disclaimer";
import { advisoryUnavailableReason } from "../shared/family-gate";
import { buildPrompt, ORACLE_SYSTEM_PROMPT } from "./prompt";
import {
  oracleToolRenderers,
  renderOracleDetails,
  renderOracleHeader,
} from "./render";
import { OracleParams } from "./types";

const tools: SubagentToolSpec[] = [
  { name: "read", type: "native", render: oracleToolRenderers.read },
  { name: "grep", type: "native", render: oracleToolRenderers.grep },
  { name: "find", type: "native", render: oracleToolRenderers.find },
  { name: "read_url", type: "native", render: oracleToolRenderers.read_url },
  {
    name: "find_sessions",
    type: "native",
    render: oracleToolRenderers.find_sessions,
  },
  {
    name: "read_session",
    type: "native",
    render: oracleToolRenderers.read_session,
  },
  {
    name: "synthetic_web_search",
    type: "native",
    render: oracleToolRenderers.synthetic_web_search,
  },
];

const extensionPaths = ["./tools", "npm:@aliou/pi-synthetic"];

export async function registerOracle(pi: ExtensionAPI): Promise<void> {
  const subagent = createSubagent(pi, {
    name: "oracle",
    modelPreferences: [
      { provider: "agents", model: "oracle", thinking: "off" },
    ],
    label: "Oracle",
    description:
      "Zero-shot senior technical advisor. Give a self-contained task, relevant context/files, constraints, and the decision or plan you need.",
    promptSnippet:
      "Senior technical advisor for architecture, code review, planning, trade-offs, and pragmatic implementation guidance.",
    promptGuidelines: [
      "oracle: Use for senior-level technical guidance, architecture advice, planning, and second opinions on design/code-review decisions.",
      "oracle: Do not use for simple lookups or file reads -- use read/grep/find directly instead.",
      "oracle: Make the task self-contained: include outcome, what good means, constraints, relevant paths/files, available evidence, verification signal, and desired final answer shape.",
      "oracle: Give a checkable target and say whether you want diagnosis only, options/trade-offs, or one recommended plan; avoid vague prompts like 'thoughts?' or 'look into this'.",
    ],
    systemPrompt: ORACLE_SYSTEM_PROMPT,
    parameters: OracleParams,
    resumable: true,
    disclaimer: ADVISORY_DISCLAIMER,
    renderHeader: renderOracleHeader,
    renderDetails: renderOracleDetails,
    buildPrompt,
    resolveAgentsFiles: (_params, ctx) => loadAgentsFilesFromCwd(ctx.cwd),
    tools,
    extensionPaths,
  });

  subagent.subscribe();

  const tool = subagent.asTool();
  const resumeTool = subagent.asResumeTool();

  // The advisory tools stay registered for every model: a visibility gate
  // under a virtual (alias) selection can apply only after the caller has
  // already discovered the tool, so gated families (GPT-5.6, GPT-6) fail the
  // call with an explanation instead of hiding the tool mid-run.
  const unavailable = (ctx: ExtensionContext): string | undefined =>
    advisoryUnavailableReason(ctx.model, ctx.sessionManager.getBranch());

  pi.registerTool({
    ...tool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const reason = unavailable(ctx);
      if (reason) throw new Error(reason);
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  });
  pi.registerTool({
    ...resumeTool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const reason = unavailable(ctx);
      if (reason) throw new Error(reason);
      return resumeTool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  });
}
