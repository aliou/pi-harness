/**
 * Standalone web fetch tool using Linkup API.
 *
 * This tool fetches a URL and returns its content as markdown,
 * without any LLM processing.
 */

import type {
  AgentToolResult,
  Theme,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { createLinkupClient } from "../clients";

const parameters = Type.Object({
  url: Type.String({
    description: "The URL to fetch content from",
  }),
  renderJs: Type.Optional(
    Type.Boolean({
      description: "Render JavaScript on the page (default: true)",
    }),
  ),
});

/** Cost per fetch in EUR */
const COST_EUR = 0.005;

/** Details for rendering */
interface WebFetchDetails {
  url: string;
  cost: number;
  duration: number; // in milliseconds
  error?: string;
}

export const webFetchTool: ToolDefinition<typeof parameters, WebFetchDetails> =
  {
    name: "web_fetch",
    label: "Web Fetch",
    description: `Fetch a URL and return its content as markdown. No LLM processing - returns raw converted content.

Use for:
- Reading documentation pages
- Fetching article content
- Getting webpage text

Requires: LINKUP_API_KEY environment variable`,

    parameters,

    async execute(
      _toolCallId: string,
      args: { url: string; renderJs?: boolean },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) {
      const { url, renderJs = true } = args;
      const startTime = Date.now();

      try {
        const client = createLinkupClient();
        const response = await client.fetch({ url, renderJs }, signal);
        const duration = Date.now() - startTime;

        if (!response.markdown) {
          return {
            content: [
              { type: "text" as const, text: "No content returned for URL" },
            ],
            details: { url, cost: COST_EUR, duration, error: "No content" },
          };
        }

        return {
          content: [{ type: "text" as const, text: response.markdown }],
          details: { url, cost: COST_EUR, duration },
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { url, cost: 0, duration, error: message },
        };
      }
    },

    renderCall(args: { url: string; renderJs?: boolean }, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("web_fetch "));
      text += theme.fg("muted", args.url);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<WebFetchDetails>,
      { expanded }: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const details = result.details;

      if (details?.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const container = new Container();

      // Footer with status, cost, and duration
      let footerText = theme.fg("success", "done");
      const footerParts: string[] = [];
      if (details?.cost && details.cost > 0) {
        footerParts.push(`${details.cost}EUR`);
      }
      if (details?.duration) {
        const durationStr =
          details.duration >= 1000
            ? `${(details.duration / 1000).toFixed(1)}s`
            : `${details.duration}ms`;
        footerParts.push(durationStr);
      }
      if (footerParts.length > 0) {
        footerText += theme.fg("muted", ` ${footerParts.join(" ")}`);
      }
      container.addChild(new Text(footerText, 0, 0));

      // Render markdown content
      if (result.content?.[0]?.type === "text") {
        const content = (result.content[0] as { text: string }).text;
        const mdTheme = getMarkdownTheme();

        if (expanded) {
          // Show complete markdown response
          container.addChild(new Markdown(content, 0, 0, mdTheme));
        } else {
          // Show first 5 lines when collapsed
          const lines = content.split("\n");
          const preview = lines.slice(0, 5).join("\n");
          container.addChild(new Markdown(preview, 0, 0, mdTheme));

          const hasMore = lines.length > 5;
          if (hasMore) {
            container.addChild(
              new Text(
                theme.fg("muted", `... (${lines.length - 5} more lines)`),
                0,
                0,
              ),
            );
          }
        }
      }

      return container;
    },
  };

/** Create the web_fetch tool */
export function createWebFetchTool(): ToolDefinition<
  typeof parameters,
  WebFetchDetails
> {
  return webFetchTool;
}
