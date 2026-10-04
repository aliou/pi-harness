import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent, loadAgentsFilesFromCwd } from "@harness/agent-kit";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import {
  configuredSubagent,
  getSubagentModelPreferences,
} from "@harness/subagent-models";
import { buildPrompt, REVIEWER_SYSTEM_PROMPT } from "./prompt";
import {
  renderReviewerDetails,
  renderReviewerHeader,
  reviewerToolRenderers,
} from "./render";
import { createReviewerTools } from "./tools";
import { ReviewerParams } from "./types";

const nativeTools: SubagentToolSpec[] = [
  { name: "read", type: "native", render: reviewerToolRenderers.read },
  { name: "grep", type: "native", render: reviewerToolRenderers.grep },
  { name: "find", type: "native", render: reviewerToolRenderers.find },
  { name: "read_url", type: "native", render: reviewerToolRenderers.read_url },
  {
    name: "synthetic_web_search",
    type: "native",
    render: reviewerToolRenderers.synthetic_web_search,
  },
];

const extensionPaths = ["./tools", "npm:@aliou/pi-synthetic"];

export async function registerReviewer(pi: ExtensionAPI): Promise<void> {
  const tools = [...nativeTools, ...createReviewerTools(pi)];

  const subagent = createSubagent(pi, {
    name: "reviewer",
    modelPreferences: () => getSubagentModelPreferences("reviewer"),
    label: "Reviewer",
    description:
      "Zero-shot formal code reviewer. Provide the exact diff command/description plus focused review criteria; it reviews statically and does not run checks.",
    promptSnippet:
      "Formal code review subagent for diffs and code changes; static analysis only, no test execution.",
    promptGuidelines: [
      "reviewer: Use for formal static review of diffs and code changes; do not use for general questions or file reads.",
      "reviewer: Provide an exact diff description or command that works from the current cwd, such as 'git diff --staged' or 'git diff main...HEAD'.",
      "reviewer: Pass cwd when the diff belongs to another local repository or path; commands and file reads will run there.",
      "reviewer: State the review outcome, severity bar, invariants, risk areas, expected behavior, verification signal, and desired finding format.",
      "reviewer: Do not ask reviewer to fix code, run tests, approve PRs, or leave PR comments; ask for cited findings with severity and concrete remediation.",
      "reviewer: For large diffs, ask for highest-impact findings and explicit residual risks instead of exhaustive commentary.",
    ],
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    parameters: ReviewerParams,
    resumable: true,
    renderHeader: renderReviewerHeader,
    renderDetails: renderReviewerDetails,
    buildPrompt,
    resolveCwd: (params, ctx) =>
      params.cwd?.trim() ? path.resolve(ctx.cwd, params.cwd.trim()) : undefined,
    resolveAgentsFiles: (params, ctx) =>
      loadAgentsFilesFromCwd(path.resolve(ctx.cwd, params.cwd?.trim() || ".")),
    tools,
    extensionPaths,
  });

  await subagent.ready;
  const { register, notifyOnSessionStart } = configuredSubagent(
    pi,
    "reviewer",
    "Reviewer",
    subagent,
    subagent.configured,
  );
  register();
  notifyOnSessionStart();
}
