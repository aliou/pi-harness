import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import {
  type BranchEntryLike,
  effectiveModelIdentity,
  type ModelIdentity,
} from "@harness/models";
import { addTools, removeTools } from "../shared/active-tools";
import {
  aliasDisablesAdvisoryTools,
  disablesAdvisoryTools,
} from "../shared/family-gate";
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

const TOOL_NAMES = ["oracle", "resume_oracle"];

function enableTools(pi: ExtensionAPI): void {
  const next = addTools(pi.getActiveTools(), TOOL_NAMES);
  if (next) pi.setActiveTools(next);
}

function disableTools(pi: ExtensionAPI): void {
  const next = removeTools(pi.getActiveTools(), TOOL_NAMES);
  if (next) pi.setActiveTools(next);
}

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
    renderHeader: renderOracleHeader,
    renderDetails: renderOracleDetails,
    buildPrompt,
    resolveAgentsFiles: (_params, ctx) => loadAgentsFilesFromCwd(ctx.cwd),
    tools,
    extensionPaths,
  });

  subagent.register();

  // Same pattern as the look_at tool: keep the oracle tools active unless
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
