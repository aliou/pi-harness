import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import {
  formatSubagentCwd,
  renderHeaderMarkdown,
  renderSubagentToolLine,
  type ToolRenderContext,
} from "@harness/agent-kit/runtime";
import type {
  SubagentToolCall,
  SubagentToolRenderer,
} from "@harness/agent-kit/types";
import { formatDisplayPath, isNotNil } from "@harness/utils";
import type { ScoutParamsType } from "./types";

export function renderScoutHeader(
  args: ScoutParamsType & { sessionId?: string },
  theme: Theme,
  ctx: ToolRenderContext,
) {
  return renderHeaderMarkdown({
    label: "Scout",
    body: args.query ?? "",
    theme,
    resuming: isNotNil(args.sessionId),
    cwd: formatSubagentCwd(args.cwd, ctx.cwd),
  });
}

export function renderScoutDetails(
  args: ScoutParamsType,
  _theme: Theme,
  _cwd: string,
) {
  const details = [
    args.cwd ? `**CWD**\n${args.cwd.trim()}` : undefined,
    args.context?.trim() ? `**Context**\n${args.context.trim()}` : undefined,
  ].filter(isNotNil);

  if (!details.length) return undefined;
  return new Markdown(details.join("\n\n"), 0, 0, getMarkdownTheme());
}

function arg(toolCall: SubagentToolCall, name: string) {
  const value = toolCall.args[name];
  if (value === undefined || value === null) return "";
  return String(value);
}

const line =
  (
    action: string,
    details: (toolCall: SubagentToolCall, cwd: string) => string = () => "",
  ): SubagentToolRenderer =>
  (toolCall, _options, theme, cwd) =>
    renderSubagentToolLine(toolCall, theme, action, details(toolCall, cwd));

export const scoutToolRenderers = {
  ls: line("List", (t, cwd) => path(t, "path", cwd)),
  read: line("Read", (t, cwd) => path(t, "path", cwd)),
  find: line("Find", (t) => quote(arg(t, "pattern"))),
  grep: line("Grep", (t) => quote(arg(t, "pattern"))),
  git_log: line("Git log", (t) => quote(arg(t, "query"))),
  git_show: line("Git show", (t) => arg(t, "rev")),
} satisfies Record<string, SubagentToolRenderer>;

function path(toolCall: SubagentToolCall, name: string, cwd: string) {
  const value = arg(toolCall, name);
  return value ? formatDisplayPath(value, cwd) : "";
}

function quote(value: string) {
  return value ? `“${value}”` : "";
}
