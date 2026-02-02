/**
 * GitHub code search tool.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  query: Type.String({
    description: "Search query (supports GitHub code search syntax)",
  }),
  repo: Type.Optional(
    Type.String({
      description: "Limit search to specific repo (owner/repo format or URL)",
    }),
  ),
});

export const githubSearchTool: ToolDefinition<typeof parameters> = {
  name: "github_search",
  label: "GitHub Search",
  description: `Search code across GitHub repositories.

Supports GitHub code search syntax including:
- Language filters: \`language:typescript\`
- Path filters: \`path:src/\`
- Extension filters: \`extension:ts\`
- Filename filters: \`filename:package.json\`

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { query: string; repo?: string },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { query, repo } = args;
    const client = createGitHubClient();

    const result = await client.searchCode(query, repo, signal);

    return {
      content: [{ type: "text" as const, text: result }],
      details: {
        query,
        repo,
      },
    };
  },
};
