/**
 * GitHub Issue tool for fetching issues or pull requests with comments.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  repo: Type.String({
    description:
      "Repository in owner/repo format (e.g., 'facebook/react') or full GitHub URL (e.g., 'https://github.com/facebook/react')",
  }),
  number: Type.Number({
    description: "Issue or pull request number",
  }),
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

export const githubIssueTool: ToolDefinition<typeof parameters> = {
  name: "github_issue",
  label: "GitHub Issue",
  description: `Fetch an issue or pull request with comments. Note: On GitHub, PRs are a type of issue, so this works for both.

Examples:
- Issue: repo="facebook/react", number=1234
- PR: repo="facebook/react", number=5678
- With URL: repo="https://github.com/facebook/react", number=1234

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { repo: string; number: number },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { repo: repoInput, number } = args;
    const client = createGitHubClient();
    const { owner, repo } = parseRepo(repoInput);

    let markdown: string;
    let contentType: "issue" | "pull_request";

    // Try fetchPullRequest first (more complete for PRs with additions/deletions/etc)
    // If 404, fall back to fetchIssue
    try {
      markdown = await client.fetchPullRequest(owner, repo, number, signal);
      contentType = "pull_request";
    } catch (error) {
      // Check if it's a 404 (not a PR, might be an issue)
      if (error instanceof Error && error.message.includes("Not found")) {
        markdown = await client.fetchIssue(owner, repo, number, signal);
        contentType = "issue";
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    return {
      content: [{ type: "text" as const, text: markdown }],
      details: {
        owner,
        repo,
        number,
        contentType,
      },
    };
  },
};
