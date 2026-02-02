/**
 * GitHub list user repositories tool.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  username: Type.String({
    description: "GitHub username to search",
  }),
  language: Type.Optional(
    Type.String({
      description: "Filter by programming language",
    }),
  ),
  namePrefix: Type.Optional(
    Type.String({
      description: "Filter by repository name prefix",
    }),
  ),
  sort: Type.Optional(
    Type.String({
      description: "Sort by: stars, forks, updated",
    }),
  ),
  order: Type.Optional(
    Type.String({
      description: "Order: asc or desc",
    }),
  ),
  per_page: Type.Optional(
    Type.Number({
      description: "Results per page (max 100)",
      default: 30,
    }),
  ),
  page: Type.Optional(
    Type.Number({
      description: "Page number",
      default: 1,
    }),
  ),
});

export const listUserReposTool: ToolDefinition<typeof parameters> = {
  name: "list_user_repos",
  label: "List User Repos",
  description: `List repositories for a GitHub user.

Supports filtering by language, name prefix, and sorting options.

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: {
      username: string;
      language?: string;
      namePrefix?: string;
      sort?: string;
      order?: string;
      per_page?: number;
      page?: number;
    },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const {
      username,
      language,
      namePrefix,
      sort,
      order,
      per_page = 30,
      page = 1,
    } = args;
    const client = createGitHubClient();

    const result = await client.listUserRepos(
      username,
      { language, namePrefix, sort, order, per_page, page },
      signal,
    );

    return {
      content: [{ type: "text" as const, text: result }],
      details: {
        username,
        language,
        namePrefix,
        sort,
        order,
        per_page,
        page,
      },
    };
  },
};
