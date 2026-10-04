import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import { reviewerToolRenderers } from "../render";
import { createGitDiffTool } from "./git-diff";

export function createReviewerTools(pi: ExtensionAPI): SubagentToolSpec[] {
  return [
    {
      name: "git_diff",
      type: "custom",
      spec: (cwd) => createGitDiffTool(pi, cwd),
      render: reviewerToolRenderers.git_diff,
    },
  ];
}
