/**
 * Web search tool using Exa search API.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createExaClient, type ExaSearchResponse } from "../../../lib/clients";
import { SEARCH_PROVIDER } from "../config";

const parameters = Type.Object({
  query: Type.String({
    description: "The search query",
  }),
  numResults: Type.Optional(
    Type.Integer({
      description: "Number of results to return (default: 10, max: 25)",
      minimum: 1,
      maximum: 25,
    }),
  ),
});

/** Format search results to markdown */
function formatSearchResults(response: ExaSearchResponse): string {
  if (response.results.length === 0) {
    return "No results found.";
  }

  let markdown = `# Search Results\n\n`;
  markdown += `Found ${response.results.length} results.\n\n`;

  for (const result of response.results) {
    markdown += `## ${result.title || "Untitled"}\n`;
    markdown += `**URL:** ${result.url}\n`;

    if (result.publishedDate) {
      markdown += `**Published:** ${result.publishedDate}\n`;
    }

    if (result.author) {
      markdown += `**Author:** ${result.author}\n`;
    }

    markdown += "\n";

    if (result.summary) {
      markdown += `${result.summary}\n`;
    } else if (result.text) {
      // Truncate long text
      const text =
        result.text.length > 500
          ? `${result.text.slice(0, 500)}...`
          : result.text;
      markdown += `${text}\n`;
    } else if (result.highlights?.length) {
      markdown += `> ${result.highlights[0]}\n`;
    }

    markdown += "\n---\n\n";
  }

  return markdown;
}

export const webSearchTool: ToolDefinition<typeof parameters> = {
  name: "web_search",
  label: "Web Search",
  description: `Search the web for information. Returns a list of relevant results with titles, URLs, and summaries.

Provider: ${SEARCH_PROVIDER}
Requires: EXA_API_KEY environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { query: string; numResults?: number },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { query, numResults = 10 } = args;

    // Provider check (only exa for now)
    if (SEARCH_PROVIDER !== "exa") {
      throw new Error(`Unsupported search provider: ${SEARCH_PROVIDER}`);
    }

    const client = createExaClient();
    const response = await client.search(
      {
        query,
        numResults,
        includeText: true,
        includeSummary: true,
        maxTextCharacters: 1000,
      },
      signal,
    );

    const markdown = formatSearchResults(response);

    return {
      content: [{ type: "text" as const, text: markdown }],
      details: {
        query,
        resultCount: response.results.length,
        provider: SEARCH_PROVIDER,
        cost: response.costDollars?.total,
      },
    };
  },
};
