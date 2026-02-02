/**
 * GitHub Issues list tool for listing issues and/or pull requests.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  repo: Type.String({
    description:
      "Repository in owner/repo format (e.g., 'facebook/react') or full GitHub URL",
  }),
  state: Type.Optional(
    Type.String({
      description: "Filter by state: open, closed, or all (default: open)",
    }),
  ),
  type: Type.Optional(
    Type.String({
      description:
        "Filter by type: issue, pr, or all (default: all). Issues API returns both; this filters client-side.",
    }),
  ),
  labels: Type.Optional(
    Type.String({
      description:
        "Comma-separated list of label names to filter by (e.g., 'bug,enhancement')",
    }),
  ),
  author: Type.Optional(
    Type.String({
      description: "Filter by author username",
    }),
  ),
  assignee: Type.Optional(
    Type.String({
      description: "Filter by assignee username",
    }),
  ),
  sort: Type.Optional(
    Type.String({
      description: "Sort by: created, updated, or comments (default: created)",
    }),
  ),
  direction: Type.Optional(
    Type.String({
      description: "Sort direction: asc or desc (default: desc)",
    }),
  ),
  per_page: Type.Optional(
    Type.Number({
      description: "Results per page, max 100 (default: 30)",
    }),
  ),
});

function parseRepo(repo: string): { owner: string; repo: string } {
  if (repo.startsWith("http://") || repo.startsWith("https://")) {
    try {
      const url = new URL(repo);
      if (url.hostname !== "github.com") {
        throw new Error(`Not a GitHub URL: ${repo}`);
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) {
        throw new Error(`Invalid GitHub URL: ${repo}`);
      }
      const owner = parts[0];
      const repoName = parts[1];
      if (!owner || !repoName) {
        throw new Error(`Invalid GitHub URL: ${repo}`);
      }
      return { owner, repo: repoName };
    } catch (error) {
      if (error instanceof Error && error.message.includes("GitHub")) {
        throw error;
      }
      throw new Error(`Invalid GitHub URL: ${repo}`);
    }
  }

  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid repository format: ${repo}. Expected 'owner/repo' or a full GitHub URL.`,
    );
  }

  return { owner: parts[0], repo: parts[1] };
}

export const githubIssuesTool: ToolDefinition<typeof parameters> = {
  name: "github_issues",
  label: "GitHub Issues",
  description: `List issues and/or pull requests in a repository.

Use this to discover issues and PRs. To read a specific issue/PR by number, use github_issue instead.

Examples:
- Open issues: repo="facebook/react"
- Open PRs: repo="facebook/react", type="pr"
- Closed bugs: repo="facebook/react", state="closed", labels="bug"
- By author: repo="facebook/react", author="gaearon", type="pr"

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: {
      repo: string;
      state?: string;
      type?: string;
      labels?: string;
      author?: string;
      assignee?: string;
      sort?: string;
      direction?: string;
      per_page?: number;
    },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { repo: repoInput, ...rest } = args;
    const client = createGitHubClient();
    const { owner, repo } = parseRepo(repoInput);

    const result = await client.listIssues(
      owner,
      repo,
      {
        state: rest.state as "open" | "closed" | "all" | undefined,
        type: rest.type as "issue" | "pr" | "all" | undefined,
        labels: rest.labels,
        author: rest.author,
        assignee: rest.assignee,
        sort: rest.sort as "created" | "updated" | "comments" | undefined,
        direction: rest.direction as "asc" | "desc" | undefined,
        per_page: rest.per_page,
      },
      signal,
    );

    return {
      content: [{ type: "text" as const, text: result }],
      details: {
        owner,
        repo,
        state: rest.state || "open",
        type: rest.type || "all",
        labels: rest.labels || null,
        author: rest.author || null,
      },
    };
  },
};
