/**
 * GitHub Commits tool for searching commits or getting diff for a specific commit.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  repo: Type.String({
    description:
      "Repository in owner/repo format (e.g., 'facebook/react') or full GitHub URL (e.g., 'https://github.com/facebook/react')",
  }),
  query: Type.Optional(
    Type.String({
      description: "Search in commit messages",
    }),
  ),
  author: Type.Optional(
    Type.String({
      description: "Filter by author (username or email)",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description: "Filter by file path",
    }),
  ),
  sha: Type.Optional(
    Type.String({
      description:
        "If provided, get diff for this specific commit instead of searching",
    }),
  ),
});

/**
 * Parse repository input to extract owner and repo.
 * Handles both 'owner/repo' format and full GitHub URLs.
 */
function parseRepo(repo: string): { owner: string; repo: string } {
  // Check if it's a full URL
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

  // Handle owner/repo format
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid repository format: ${repo}. Expected 'owner/repo' or a full GitHub URL.`,
    );
  }

  return { owner: parts[0], repo: parts[1] };
}

export const githubCommitsTool: ToolDefinition<typeof parameters> = {
  name: "github_commits",
  label: "GitHub Commits",
  description: `Search commits or get diff for a specific commit.

Usage:
- Search commits: provide repo and optionally query, author, or path
- Get commit diff: provide repo and sha

Examples:
- Search by message: repo="facebook/react", query="fix bug"
- Filter by author: repo="facebook/react", author="gaearon"
- Filter by path: repo="facebook/react", path="packages/react/src"
- Get diff: repo="facebook/react", sha="abc1234"

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: {
      repo: string;
      query?: string;
      author?: string;
      path?: string;
      sha?: string;
    },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { repo: repoInput, query, author, path, sha } = args;
    const client = createGitHubClient();
    const { owner, repo } = parseRepo(repoInput);

    let markdown: string;
    let mode: "diff" | "search";

    if (sha) {
      // Get diff for specific commit
      markdown = await client.getCommitDiff(owner, repo, sha, signal);
      mode = "diff";
    } else {
      // Search commits
      markdown = await client.searchCommits(
        owner,
        repo,
        { query, author, path },
        signal,
      );
      mode = "search";
    }

    return {
      content: [{ type: "text" as const, text: markdown }],
      details: {
        owner,
        repo,
        mode,
        sha: sha || null,
        query: query || null,
        author: author || null,
        path: path || null,
      },
    };
  },
};
