import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import { ADVISORY_DISCLAIMER } from "../shared/disclaimer";
import { advisoryUnavailableReason } from "../shared/family-gate";
import { ADVISOR_SYSTEM_PROMPT, buildPrompt } from "./prompt";
import {
  advisorToolRenderers,
  renderAdvisorDetails,
  renderAdvisorHeader,
} from "./render";
import { AdvisorParams } from "./types";

const tools: SubagentToolSpec[] = [
  { name: "read", type: "native", render: advisorToolRenderers.read },
  { name: "grep", type: "native", render: advisorToolRenderers.grep },
  { name: "find", type: "native", render: advisorToolRenderers.find },
  { name: "read_url", type: "native", render: advisorToolRenderers.read_url },
  {
    name: "find_sessions",
    type: "native",
    render: advisorToolRenderers.find_sessions,
  },
  {
    name: "read_session",
    type: "native",
    render: advisorToolRenderers.read_session,
  },
  {
    name: "synthetic_web_search",
    type: "native",
    render: advisorToolRenderers.synthetic_web_search,
  },
];

const extensionPaths = [
  "./tools",
  "npm:@aliou/pi-synthetic",
  "./hooks/provider-tweaks",
];

export async function registerAdvisor(pi: ExtensionAPI): Promise<void> {
  const subagent = createSubagent(pi, {
    name: "advisor",
    modelPreferences: [
      { provider: "agents", model: "advisor", thinking: "off" },
    ],
    label: "Advisor",
    description:
      "Zero-shot strategic advisor. Use for hard decisions, stuck work, risk review, and pre-completion second opinions.",
    promptSnippet:
      "Strategic second-opinion advisor for hard decisions; provide a literal task contract with scope, evidence, constraints, verification, and decision needed.",
    promptGuidelines: [
      "advisor: Use for hard decisions, recurring failures, architecture/risk trade-offs, and before declaring complex work done.",
      "advisor: Do not use for simple lookups, obvious one-line edits, routine formatting, or work where the next action is dictated by already-read tool output.",
      "advisor: Make the task self-contained as a testable contract: outcome, scope, constraints, available evidence, verification signal, final response shape, and decision needed.",
      "advisor: Prefer calling after read-only orientation but before writing or state-changing commands on multi-step tasks.",
      "advisor: Include files when file-specific claims matter; ask for cited path/symbol evidence and concise guidance the main agent can apply immediately.",
      "advisor: Keep the scope narrow. Ask for one recommended next move plus material risks, assumptions, and smallest useful checks.",
    ],
    systemPrompt: ADVISOR_SYSTEM_PROMPT,
    parameters: AdvisorParams,
    resumable: true,
    disclaimer: ADVISORY_DISCLAIMER,
    renderHeader: renderAdvisorHeader,
    renderDetails: renderAdvisorDetails,
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
