import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import {
  renderHeaderMarkdown,
  type ToolRenderContext,
} from "@harness/agent-kit/runtime";
import { formatDisplayPath, isNotNil } from "@harness/utils";
import type { LookAtParamsInput } from "./types";

export function renderLookAtHeader(
  args: LookAtParamsInput & { sessionId?: string },
  theme: Theme,
  _ctx: ToolRenderContext,
) {
  return renderHeaderMarkdown({
    label: "Look At",
    body: args.objective ?? "",
    theme,
    resuming: isNotNil(args.sessionId),
  });
}

export function renderLookAtDetails(
  args: LookAtParamsInput,
  _theme: Theme,
  cwd: string,
) {
  const sections = [`**Image**\n${formatDisplayPath(args.path, cwd)}`];
  if (args.context?.trim()) {
    sections.push(`**Context**\n${args.context.trim()}`);
  }
  return new Markdown(sections.join("\n\n"), 0, 0, getMarkdownTheme());
}
