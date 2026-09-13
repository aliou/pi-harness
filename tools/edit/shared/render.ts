import type { Theme } from "@earendil-works/pi-coding-agent";
import { keyHint, renderDiff } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";

export interface EditRenderState {
  callComponent?: Component;
}

export type EditCallStatus = "pending" | "success" | "error";

export type EditCallComponent = Text;

export interface DiffResultDetails {
  diff?: string;
}

export interface TextContentBlock {
  type: string;
  text?: string;
}

export interface RenderableToolResult<TDetails> {
  content: TextContentBlock[];
  details?: TDetails;
}

export interface EditRenderContext<TArgs> {
  args: TArgs;
  cwd: string;
  lastComponent?: Component;
  state: EditRenderState;
  isError: boolean;
  isPartial: boolean;
  /** True once argument streaming finished (message ended). */
  argsComplete?: boolean;
  /** Request a redraw once an async computation finishes. */
  invalidate?: () => void;
}

export function getCallComponent(
  state: EditRenderState,
  lastComponent: Component | undefined,
): EditCallComponent {
  if (lastComponent instanceof Text) {
    state.callComponent = lastComponent;
    return lastComponent;
  }
  if (state.callComponent) {
    if (state.callComponent instanceof Text) {
      return state.callComponent;
    }
  }
  const component = new Text("", 0, 0);
  state.callComponent = component;
  return component;
}

export function statusFromContext(context: {
  isError: boolean;
  isPartial: boolean;
}): EditCallStatus {
  if (context.isPartial) return "pending";
  return context.isError ? "error" : "success";
}

export function buildEditCallComponent(
  component: EditCallComponent,
  title: string,
  detail: string | undefined,
  _status: EditCallStatus,
  theme: Theme,
): EditCallComponent {
  const suffix = detail ? ` ${theme.fg("text", detail)}` : "";
  component.setText(`${theme.fg("toolTitle", theme.bold(title))}${suffix}`);
  return component;
}

export function extractTextOutput(
  result: RenderableToolResult<unknown>,
): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .filter(Boolean)
    .join("\n");
}

export function summarizeDiff(diff: string): {
  additions: number;
  removals: number;
} {
  let additions = 0;
  let removals = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removals++;
    }
  }
  return { additions, removals };
}

export function formatCollapsedDiffSummary(diff: string, theme: Theme): string {
  const { additions, removals } = summarizeDiff(diff);
  return `${theme.fg("success", `+${additions}`)}${theme.fg("dim", " / ")}${theme.fg("error", `-${removals}`)}`;
}

export function formatDiffResultText(
  diff: string | undefined,
  expanded: boolean,
  theme: Theme,
): string | undefined {
  if (!diff) return undefined;
  const rendered = renderDiff(diff);
  if (expanded) return rendered;

  const lines = rendered.split("\n");
  const maxLines = 10;
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;
  if (remaining <= 0) {
    return displayLines.join("\n");
  }
  return `${displayLines.join("\n")}${theme.fg("muted", `\n... (${remaining} more lines, ${lines.length} total,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
}

export function renderEditResultComponent(
  result: RenderableToolResult<DiffResultDetails | undefined>,
  options: { expanded: boolean },
  theme: Theme,
  context: { isError: boolean; lastComponent?: Component },
): Component {
  const component = (
    context.lastComponent instanceof Container
      ? context.lastComponent
      : new Container()
  ) as Container;
  component.clear();

  const output = context.isError
    ? theme.fg("error", extractTextOutput(result))
    : formatDiffResultText(result.details?.diff, options.expanded, theme);

  if (!output) {
    return component;
  }

  component.addChild(new Spacer(1));
  component.addChild(new Text(output, 0, 0));

  return component;
}
