/**
 * Web fetch tool using Exa contents API.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  createExaClient,
  type ExaContentsResponse,
} from "../../../lib/clients";
import { FETCH_PROVIDER } from "../config";

const parameters = Type.Object({
  url: Type.String({
    description: "The URL to fetch content from",
  }),
});

/**
 * Exa error tags and their meanings:
 * - CRAWL_NOT_FOUND (404): Content not found at URL
 * - CRAWL_TIMEOUT (408): Request timed out
 * - CRAWL_LIVECRAWL_TIMEOUT (408): Live crawl timed out
 * - SOURCE_NOT_AVAILABLE (403): Access forbidden or behind paywall
 * - CRAWL_UNKNOWN_ERROR (500+): Other crawling errors
 */
const EXA_ERROR_MESSAGES: Record<string, string> = {
  CRAWL_NOT_FOUND: "Page not found",
  CRAWL_TIMEOUT: "Request timed out",
  CRAWL_LIVECRAWL_TIMEOUT: "Live crawl timed out",
  SOURCE_NOT_AVAILABLE: "Access forbidden or behind paywall",
  CRAWL_UNKNOWN_ERROR: "Failed to crawl page",
};

/** Check if Exa response has errors and throw if so */
function checkExaErrors(response: ExaContentsResponse, url: string): void {
  // Check statuses array for errors
  if (response.statuses?.length) {
    const status = response.statuses.find((s) => s.id === url);
    if (status?.status === "error") {
      const tag = status.error?.tag ?? "CRAWL_UNKNOWN_ERROR";
      const code = status.error?.httpStatusCode;
      const message = EXA_ERROR_MESSAGES[tag] ?? "Unknown error";
      const codeStr = code ? ` (${code})` : "";
      throw new Error(`${message}${codeStr}`);
    }
  }

  // Also check if results are empty without explicit error
  if (response.results.length === 0) {
    throw new Error("No content returned for URL");
  }
}

/** Format Exa contents result to markdown */
function formatContentsResult(result: ExaContentsResponse): string {
  // This is now only called after checkExaErrors passes
  if (result.results.length === 0) {
    return "No content found for the URL.";
  }

  const item = result.results[0];
  if (!item) {
    return "No content found for the URL.";
  }

  let markdown = "";

  if (item.title) {
    markdown += `# ${item.title}\n\n`;
  }

  markdown += `**URL:** ${item.url}\n`;

  if (item.publishedDate) {
    markdown += `**Published:** ${item.publishedDate}\n`;
  }

  if (item.author) {
    markdown += `**Author:** ${item.author}\n`;
  }

  markdown += "\n";

  if (item.text) {
    markdown += item.text;
  } else if (item.summary) {
    markdown += item.summary;
  } else {
    markdown += "No text content available.";
  }

  return markdown;
}

export const webFetchTool: ToolDefinition<typeof parameters> = {
  name: "web_fetch",
  label: "Web Fetch",
  description: `Fetch the content of a URL and return it as markdown. Use this for general webpages, articles, documentation, etc.

Provider: ${FETCH_PROVIDER}
Requires: EXA_API_KEY environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { url: string },
    _onUpdate: unknown,
    _ctx: unknown,
    signal?: AbortSignal,
  ) {
    const { url } = args;

    // Provider check (only exa for now)
    if (FETCH_PROVIDER !== "exa") {
      throw new Error(`Unsupported fetch provider: ${FETCH_PROVIDER}`);
    }

    const client = createExaClient();
    const response = await client.contents(
      {
        urls: [url],
        includeText: true,
        livecrawl: "fallback",
      },
      signal,
    );

    // Check for per-URL errors in statuses
    checkExaErrors(response, url);

    const markdown = formatContentsResult(response);

    return {
      content: [{ type: "text" as const, text: markdown }],
      details: {
        url,
        provider: FETCH_PROVIDER,
        cost: response.costDollars?.total,
      },
    };
  },
};
