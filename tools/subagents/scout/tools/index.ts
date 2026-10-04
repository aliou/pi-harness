import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SubagentToolSpec } from "@harness/agent-kit/types";
import { scoutToolRenderers } from "../render";
import { createScoutFindTool } from "./find";
import { createScoutGitLogTool } from "./git-log";
import { createScoutGitShowTool } from "./git-show";
import { createScoutGrepTool } from "./grep";

export function createScoutTools(pi: ExtensionAPI): SubagentToolSpec[] {
  return [
    {
      name: "git_log",
      type: "custom",
      spec: (cwd) => createScoutGitLogTool(pi, cwd),
      render: scoutToolRenderers.git_log,
    },
    {
      name: "git_show",
      type: "custom",
      spec: (cwd) => createScoutGitShowTool(pi, cwd),
      render: scoutToolRenderers.git_show,
    },
    { name: "ls", type: "native", render: scoutToolRenderers.ls },
    { name: "read", type: "native", render: scoutToolRenderers.read },
    {
      name: "find",
      type: "custom",
      spec: (cwd) => createScoutFindTool(pi, cwd),
      render: scoutToolRenderers.find,
    },
    {
      name: "grep",
      type: "custom",
      // renderCall/renderResult stripped: typed parameters don't survive
      // assignment into the generic SubagentToolSpec ToolDefinition type, and
      // parent-side rendering uses SubagentToolRenderer anyway.
      spec: (cwd) => ({
        ...createScoutGrepTool(cwd),
        renderCall: undefined,
        renderResult: undefined,
      }),
      render: scoutToolRenderers.grep,
    },
  ];
}
