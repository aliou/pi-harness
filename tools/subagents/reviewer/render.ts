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
import type { ReviewerParamsType } from "./types";

export function renderReviewerHeader(
  args: ReviewerParamsType & { sessionId?: string },
  theme: Theme,
  ctx: ToolRenderContext,
) {
  return renderHeaderMarkdown({
    label: "Reviewer",
    body: args.diff_description ?? "",
    theme,
    resuming: isNotNil(args.sessionId),
    cwd: formatSubagentCwd(args.cwd, ctx.cwd),
  });
}

export function renderReviewerDetails(
  args: ReviewerParamsType,
  _theme: Theme,
  _cwd: string,
) {
  const details = [
    args.cwd ? `**CWD**\n${args.cwd.trim()}` : undefined,
    args.instructions?.trim()
      ? `**Instructions**\n${args.instructions.trim()}`
      : undefined,
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

export const reviewerToolRenderers = {
  read: line("Read", (t, cwd) => path(t, "path", cwd)),
  grep: line("Grep", (t) => quote(arg(t, "pattern"))),
  find: line("Find", (t) => quote(arg(t, "pattern"))),
  read_url: line("Read URL", (t) => arg(t, "url")),
  synthetic_web_search: line("Web search", (t) => quote(arg(t, "query"))),
  git_diff: line("Git diff", (t) => formatGitArgs(t)),
} satisfies Record<string, SubagentToolRenderer>;

function formatGitArgs(toolCall: SubagentToolCall) {
  const args = toolCall.args.args;
  if (!Array.isArray(args) || args.length === 0) return "";
  return args.map(String).join(" ");
}

function path(toolCall: SubagentToolCall, name: string, cwd: string) {
  const value = arg(toolCall, name);
  return value ? formatDisplayPath(value, cwd) : "";
}

function quote(value: string) {
  return value ? `\u201c${value}\u201d` : "";
}
