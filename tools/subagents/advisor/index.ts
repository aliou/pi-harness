import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import {
  type BranchEntryLike,
  effectiveModelIdentity,
  type ModelIdentity,
} from "@harness/models";
import { addTools, removeTools } from "../shared/active-tools";
import { ADVISORY_DISCLAIMER } from "../shared/disclaimer";
import {
  aliasDisablesAdvisoryTools,
  disablesAdvisoryTools,
} from "../shared/family-gate";
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

const TOOL_NAMES = ["advisor", "resume_advisor"];

function enableTools(pi: ExtensionAPI): void {
  const next = addTools(pi.getActiveTools(), TOOL_NAMES);
  if (next) pi.setActiveTools(next);
}

function disableTools(pi: ExtensionAPI): void {
  const next = removeTools(pi.getActiveTools(), TOOL_NAMES);
  if (next) pi.setActiveTools(next);
}

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

  subagent.register();

  // Same pattern as the look_at tool: keep the advisor tools active unless
  // the session model belongs to a family that should not use them. Under a
  // virtual (alias) selection the family lives on the routed physical model;
  // before the alias has routed on this branch, aliases whose id pins the
  // family (`latest/*`/`fast/*` gpt aliases) decide immediately, so the tools
  // are hidden from the first run. The gate is re-applied in the context
  // handler too: agent_start only fires once per run, but an alias's routing
  // state first appears mid-run (written when the alias answers), so within
  // the very first run on an alias the context event is the only point that
  // sees the routed model.
  const syncTools = (
    model: (ModelIdentity & { api?: string }) | undefined,
    branch: readonly BranchEntryLike[],
  ): void => {
    const identity = effectiveModelIdentity(model, branch);
    const disable = identity
      ? disablesAdvisoryTools(identity)
      : aliasDisablesAdvisoryTools(model);
    disable ? disableTools(pi) : enableTools(pi);
  };
  pi.on("session_start", (_event, ctx) => {
    syncTools(ctx.model, ctx.sessionManager.getBranch());
  });
  pi.on("agent_start", (_event, ctx) => {
    syncTools(ctx.model, ctx.sessionManager.getBranch());
  });
  pi.on("model_select", (event, ctx) => {
    syncTools(event.model, ctx.sessionManager.getBranch());
  });
  pi.on("context", (_event, ctx) => {
    syncTools(ctx.model, ctx.sessionManager.getBranch());
  });
}
