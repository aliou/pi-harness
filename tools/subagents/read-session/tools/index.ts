import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  renderHeaderMarkdown,
  renderSubagentToolLine,
  type ToolRenderContext,
} from "@harness/agent-kit/runtime";
import type {
  SubagentToolCall,
  SubagentToolSpec,
} from "@harness/agent-kit/types";
import { isNotNil } from "@harness/utils";
import type { ReadSessionParamsType } from "../types";
import { branchEntries } from "./branch-entries";
import { checkpoints, readCheckpoint } from "./checkpoints";
import { entriesBetween } from "./entries-between";
import { findEntries } from "./find-entries";
import { labels } from "./labels";
import { readEntry } from "./read-entry";
import { sessionMap } from "./session-map";
import { sessionOverview } from "./session-overview";
import { treeOutline } from "./tree-outline";

export function renderReadSessionHeader(
  args: ReadSessionParamsType & { sessionId?: string },
  theme: Theme,
  _ctx: ToolRenderContext,
) {
  const target = args.targetSessionId ? `${args.targetSessionId} ` : "";
  return renderHeaderMarkdown({
    label: "Read Session",
    body: `${target}${args.goal ?? ""}`,
    theme,
    resuming: isNotNil(args.sessionId),
  });
}

export const tools: SubagentToolSpec[] = [
  {
    type: "custom",
    name: sessionOverview.name,
    spec: () => sessionOverview,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(toolCall, theme, "Get Overview"),
  },
  {
    type: "custom",
    name: sessionMap.name,
    spec: () => sessionMap,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(toolCall, theme, "Get Session Map"),
  },
  {
    type: "custom",
    name: branchEntries.name,
    spec: () => branchEntries,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(
        toolCall,
        theme,
        "Read branch",
        formatBranchDetails(toolCall),
      ),
  },
  {
    type: "custom",
    name: entriesBetween.name,
    spec: () => entriesBetween,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(
        toolCall,
        theme,
        "Read range",
        `${arg(toolCall, "startId")}..${arg(toolCall, "endId")}`,
      ),
  },
  {
    type: "custom",
    name: readEntry.name,
    spec: () => readEntry,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(toolCall, theme, "Read", arg(toolCall, "id")),
  },
  {
    type: "custom",
    name: checkpoints.name,
    spec: () => checkpoints,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(toolCall, theme, "List checkpoints"),
  },
  {
    type: "custom",
    name: readCheckpoint.name,
    spec: () => readCheckpoint,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(
        toolCall,
        theme,
        "Read checkpoint",
        arg(toolCall, "id"),
      ),
  },
  {
    type: "custom",
    name: findEntries.name,
    spec: () => findEntries,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(
        toolCall,
        theme,
        "Search",
        quote(arg(toolCall, "query")),
      ),
  },
  {
    type: "custom",
    name: labels.name,
    spec: () => labels,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(toolCall, theme, "List labels"),
  },
  {
    type: "custom",
    name: treeOutline.name,
    spec: () => treeOutline,
    render: (toolCall, _options, theme) =>
      renderSubagentToolLine(toolCall, theme, "Tree outline"),
  },
];

function formatBranchDetails(toolCall: SubagentToolCall) {
  const parts = [
    toolCall.args.leafId ? `leaf ${arg(toolCall, "leafId")}` : undefined,
    toolCall.args.limit ? `last ${String(toolCall.args.limit)}` : undefined,
    toolCall.args.fromEnd ? "leaf-to-root" : "root-to-leaf",
  ];

  return parts.filter(Boolean).join(", ");
}

function arg(toolCall: SubagentToolCall, name: string) {
  const value = toolCall.args[name];
  if (value === undefined || value === null) return "?";
  return String(value);
}

function quote(value: string) {
  return `\u201c${value}\u201d`;
}
