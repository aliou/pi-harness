import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import {
  configuredSubagent,
  getSubagentModelPreferences,
} from "@harness/subagent-models";
import { buildPrompt, ORACLE_SYSTEM_PROMPT } from "./prompt";
import {
  oracleToolRenderers,
  renderOracleDetails,
  renderOracleHeader,
} from "./render";
import { OracleParams } from "./types";
import { disablesOracleTools } from "./utils";

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
  const active = pi.getActiveTools();
  const missing = TOOL_NAMES.filter((name) => !active.includes(name));
  if (missing.length > 0) pi.setActiveTools([...active, ...missing]);
}

function disableTools(pi: ExtensionAPI): void {
  const active = pi.getActiveTools();
  pi.setActiveTools(active.filter((name) => !TOOL_NAMES.includes(name)));
}

export default async function oracle(pi: ExtensionAPI): Promise<void> {
  const subagent = createSubagent(pi, {
    name: "oracle",
    modelPreferences: () => getSubagentModelPreferences("oracle"),
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

  await subagent.ready;
  const { register, notifyOnSessionStart } = configuredSubagent(
    pi,
    "oracle",
    "Oracle",
    subagent,
    subagent.configured,
  );
  register();
  notifyOnSessionStart();

  if (!subagent.configured) return;

  // Same pattern as the look_at tool: keep the oracle tools active unless
  // the session model belongs to a family that should not use them.
  pi.on("agent_start", (_event, ctx) => {
    const model = ctx.model;
    if (!model) return;
    disablesOracleTools(model) ? disableTools(pi) : enableTools(pi);
  });
  pi.on("model_select", (event) => {
    disablesOracleTools(event.model) ? disableTools(pi) : enableTools(pi);
  });
}
