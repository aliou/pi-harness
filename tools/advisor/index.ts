import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import {
  configuredSubagent,
  getSubagentModelPreferences,
} from "@harness/subagent-models";
import { ADVISOR_SYSTEM_PROMPT, buildPrompt } from "./prompt";
import {
  advisorToolRenderers,
  renderAdvisorDetails,
  renderAdvisorHeader,
} from "./render";
import { AdvisorParams } from "./types";
import { disablesAdvisorTools } from "./utils";

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
  const active = pi.getActiveTools();
  const missing = TOOL_NAMES.filter((name) => !active.includes(name));
  if (missing.length > 0) pi.setActiveTools([...active, ...missing]);
}

function disableTools(pi: ExtensionAPI): void {
  const active = pi.getActiveTools();
  pi.setActiveTools(active.filter((name) => !TOOL_NAMES.includes(name)));
}

export default async function advisor(pi: ExtensionAPI): Promise<void> {
  const subagent = createSubagent(pi, {
    name: "advisor",
    modelPreferences: () => getSubagentModelPreferences("advisor"),
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
    renderHeader: renderAdvisorHeader,
    renderDetails: renderAdvisorDetails,
    buildPrompt,
    resolveAgentsFiles: (_params, ctx) => loadAgentsFilesFromCwd(ctx.cwd),
    tools,
    extensionPaths,
  });

  await subagent.ready;
  const { register, notifyOnSessionStart } = configuredSubagent(
    pi,
    "advisor",
    "Advisor",
    subagent,
    subagent.configured,
  );
  register();
  notifyOnSessionStart();

  if (!subagent.configured) return;

  // Same pattern as the look_at tool: keep the advisor tools active unless
  // the session model belongs to a family that should not use them.
  pi.on("agent_start", (_event, ctx) => {
    const model = ctx.model;
    if (!model) return;
    disablesAdvisorTools(model) ? disableTools(pi) : enableTools(pi);
  });
  pi.on("model_select", (event) => {
    disablesAdvisorTools(event.model) ? disableTools(pi) : enableTools(pi);
  });
}
