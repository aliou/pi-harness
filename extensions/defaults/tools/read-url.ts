import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import {
  createMarkdownNewHandler,
  createTwitterHandler,
  type ReadUrlHandler,
} from "./read-url/handlers";

const ReadUrlParams = Type.Object({
  url: Type.String({
    description: "URL to fetch as Markdown via markdown.new",
  }),
});

type ReadUrlParamsType = Static<typeof ReadUrlParams>;

interface ReadUrlDetails {
  url: string;
  sourceUrl: string;
  title?: string;
  handler: string;
  statusCode?: number;
  statusText?: string;
  failed: boolean;
}

type ExecuteResult = AgentToolResult<ReadUrlDetails>;

const COLLAPSED_PREVIEW_LINES = 8;

export function setupReadUrlTool(pi: ExtensionAPI): void {
  const handlers: ReadUrlHandler[] = [
    createTwitterHandler(),
    createMarkdownNewHandler(),
  ];

  pi.registerTool<typeof ReadUrlParams, ReadUrlDetails>({
    name: "read_url",
    label: "Read URL",
    description:
      "Fetch a URL as Markdown via handlers with markdown.new fallback.",
    parameters: ReadUrlParams,

    async execute(
      _toolCallId: string,
      params: ReadUrlParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      const input = params.url.trim();

      if (!input) {
        throw new Error("url is required");
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(input);
      } catch {
        throw new Error(`Invalid URL: ${input}`);
      }

      const handler = handlers.find((candidate) =>
        candidate.matches(parsedUrl),
      );
      if (!handler) {
        throw new Error("No handler available for this URL");
      }

      const data = await handler.fetchData(parsedUrl, signal);

      return {
        content: [{ type: "text", text: data.markdown }],
        details: {
          url: input,
          sourceUrl: data.sourceUrl,
          title: data.title,
          handler: handler.name,
          statusCode: data.statusCode,
          statusText: data.statusText,
          failed: false,
        },
      };
    },

    renderCall(args: ReadUrlParamsType, theme: Theme) {
      return new ToolCallHeader(
        {
          toolName: "Read URL",
          mainArg: args.url.trim(),
          showColon: true,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<ReadUrlDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      if (options.isPartial) {
        return new Text(theme.fg("muted", "Read URL: fetching..."), 0, 0);
      }

      const isError = Boolean((result as { isError?: boolean }).isError);
      const textBlock = result.content.find((c) => c.type === "text");
      const markdownText =
        textBlock?.type === "text" && textBlock.text ? textBlock.text : "";

      const container = new Container();

      if (isError) {
        const errorText = markdownText || "Read URL failed";
        container.addChild(new Text(theme.fg("error", errorText), 0, 0));
      } else if (markdownText) {
        const collapsed = !options.expanded;

        if (collapsed) {
          const lines = markdownText.split("\n");
          const visibleText = lines
            .slice(0, COLLAPSED_PREVIEW_LINES)
            .join("\n");
          const remaining = Math.max(lines.length - COLLAPSED_PREVIEW_LINES, 0);

          container.addChild(
            new Markdown(visibleText, 0, 0, getMarkdownTheme(), {
              color: (text: string) => theme.fg("toolOutput", text),
            }),
          );

          if (remaining > 0) {
            container.addChild(
              new Text(
                theme.fg(
                  "muted",
                  `... (${remaining} more lines, ${keyHint("expandTools", "to expand")})`,
                ),
                0,
                0,
              ),
            );
          }
        } else {
          container.addChild(
            new Markdown(markdownText, 0, 0, getMarkdownTheme(), {
              color: (text: string) => theme.fg("toolOutput", text),
            }),
          );
        }
      } else {
        container.addChild(
          new Text(theme.fg("muted", "Read URL: no content"), 0, 0),
        );
      }

      const status = result.details?.statusCode
        ? `${result.details.statusCode}${
            result.details.statusText ? ` ${result.details.statusText}` : ""
          }`
        : "n/a";
      const failed = isError || result.details?.failed === true ? "yes" : "no";
      const handler = result.details?.handler ?? "unknown";

      container.addChild(new Text("", 0, 0));
      container.addChild(
        new Text(
          `${theme.fg("muted", "handler=")}${theme.fg("dim", handler)}  ${theme.fg("muted", "HTTP:")} ${theme.fg("dim", status)}  ${theme.fg("muted", "failed=")}${theme.fg(failed === "yes" ? "error" : "success", failed)}`,
          0,
          0,
        ),
      );

      return container;
    },
  });
}
