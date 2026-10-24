import type {
  AgentToolResult,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { SubagentConfig } from "../../types";
import type { SubagentDetails, SubagentToolCall } from "../types";
import { renderThinking, renderToolCall } from "./activity";
import { CollapsedLine } from "./collapsed-line";
import { formatCollapsedHint } from "./footer";
import { Separator } from "./separator";
import type { ToolRenderContext } from "./types";
import { selectCollapsedPreview } from "./utils";

export function renderSubagentResult(
  config: SubagentConfig,
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  ctx: ToolRenderContext,
) {
  const container = new Container();
  container.addChild(new Spacer(1));

  const details = result.details as SubagentDetails | undefined;

  if (!details) {
    const text = result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    container.addChild(
      text
        ? new Markdown(text, 0, 0, getMarkdownTheme())
        : new Text(theme.fg("muted", "Starting..."), 0, 0),
    );
    return container;
  }

  const running = details.status === "running" || options.isPartial;
  const isError = !running && !details.response && Boolean(details.error);

  if (options.expanded) {
    const detailsBlock = config.renderDetails?.(details.params, theme, ctx.cwd);
    if (detailsBlock) {
      container.addChild(detailsBlock);
      container.addChild(new Separator(theme));
      // Give the error message an empty line of separation from the details.
      if (isError) container.addChild(new Spacer(1));
    }
  }

  let footerPrefix: string | undefined;
  if (running) {
    container.addChild(renderRunning(config, details, options, theme, ctx.cwd));
  } else {
    const text = details.response ?? details.error ?? "";
    if (options.expanded) {
      container.addChild(renderExpandedResponse(text, details, config, theme));
    } else {
      const collapsed = renderCollapsedResponse(text);
      container.addChild(collapsed.component);
      footerPrefix = collapsed.footerPrefix;
    }
  }

  container.addChild(new Spacer(1));
  container.addChild(
    new Text(formatCollapsedHint(details, options, footerPrefix), 0, 0),
  );

  return container;
}

function renderExpandedResponse(
  text: string,
  details: SubagentDetails,
  config: SubagentConfig,
  theme: Theme,
) {
  const container = new Container();
  // An errored run has no answer the disclaimer qualifies.
  const { before, after } = details.response ? (config.disclaimer ?? {}) : {};

  if (before) {
    container.addChild(new Text(theme.fg("muted", before), 0, 0));
    container.addChild(new Spacer(1));
  }

  container.addChild(new Markdown(text, 0, 0, getMarkdownTheme()));

  if (after) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", after), 0, 0));
  }

  return container;
}

function renderCollapsedResponse(text: string) {
  const { preview, hidden } = selectCollapsedPreview(text);
  return {
    component: new Markdown(preview, 0, 0, getMarkdownTheme()),
    footerPrefix:
      hidden > 0
        ? `${hidden} ${hidden === 1 ? "paragraph" : "paragraphs"} more`
        : undefined,
  };
}

function renderRunning(
  config: SubagentConfig,
  details: SubagentDetails,
  options: ToolRenderResultOptions,
  theme: Theme,
  cwd: string,
) {
  const container = new Container();

  if (!options.expanded) {
    const recentActivity = renderRecentActivity(
      config,
      details,
      options,
      theme,
      cwd,
    );

    if (!recentActivity) {
      container.addChild(
        new Text(theme.fg("muted", "Waiting for subagent activity..."), 0, 0),
      );
    } else {
      container.addChild(recentActivity);
    }
  } else {
    const activity = renderActivity(config, details, options, theme, cwd);

    if (!activity) {
      container.addChild(
        new Text(theme.fg("muted", "Waiting for subagent activity..."), 0, 0),
      );
    } else {
      container.addChild(activity);
    }
  }

  return container;
}

function renderRecentActivity(
  config: SubagentConfig,
  details: SubagentDetails,
  options: ToolRenderResultOptions,
  theme: Theme,
  cwd: string,
) {
  const latestItems = details.activity.slice(-3);
  if (latestItems.length === 0) return undefined;
  return renderActivityItems(config, details, latestItems, options, theme, cwd);
}

function renderActivity(
  config: SubagentConfig,
  details: SubagentDetails,
  options: ToolRenderResultOptions,
  theme: Theme,
  cwd: string,
) {
  return renderActivityItems(
    config,
    details,
    details.activity,
    options,
    theme,
    cwd,
  );
}

function renderActivityItems(
  config: SubagentConfig,
  details: SubagentDetails,
  items: SubagentDetails["activity"],
  options: ToolRenderResultOptions,
  theme: Theme,
  cwd: string,
) {
  const toolCallsById = new Map(
    details.toolCalls.map((toolCall) => [toolCall.toolCallId, toolCall]),
  );
  const container = new Container();
  let renderedCount = 0;

  for (const item of items) {
    switch (item.type) {
      case "thinking": {
        const thinking = renderThinking(
          item.endedAt === null,
          item.content,
          theme,
          options.expanded,
        );
        container.addChild(
          options.expanded ? thinking : new CollapsedLine(thinking),
        );
        renderedCount += 1;
        break;
      }
      case "tool_call": {
        const toolCall = toolCallsById.get(item.toolCallId);
        if (!toolCall) break;

        const renderedToolCall = renderConfiguredToolCall(
          config,
          toolCall,
          options,
          theme,
          cwd,
        );
        container.addChild(
          options.expanded
            ? renderedToolCall
            : new CollapsedLine(renderedToolCall),
        );
        renderedCount += 1;
        break;
      }
      default:
        throw new Error(`Unknown activity type: ${item}`);
    }
  }

  if (renderedCount === 0) {
    return undefined;
  }

  return container;
}

function renderConfiguredToolCall(
  config: SubagentConfig,
  toolCall: SubagentToolCall,
  options: ToolRenderResultOptions,
  theme: Theme,
  cwd: string,
) {
  // config.tools may be a per-invocation resolver; only static arrays expose
  // per-tool renderers. Dynamic tools fall back to the default renderer.
  const tools = Array.isArray(config.tools) ? config.tools : [];
  const renderer = tools.find(
    (tool) => tool.name === toolCall.toolName,
  )?.render;

  return (
    renderer?.(toolCall, options, theme, cwd) ??
    renderToolCall(toolCall, theme, cwd)
  );
}
