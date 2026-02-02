/**
 * GitHub PR Reviews tool for fetching reviews and inline code comments.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  repo: Type.String({
    description:
      "Repository in owner/repo format (e.g., 'facebook/react') or full GitHub URL",
  }),
  number: Type.Number({
    description: "Pull request number",
  }),
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

export const githubPrReviewsTool: ToolDefinition<typeof parameters> = {
  name: "github_pr_reviews",
  label: "GitHub PR Reviews",
  description: `Fetch reviews and inline code comments for a pull request.

Returns review verdicts (approved, changes requested, etc.) and inline comments on specific lines of code. For the PR diff itself, use github_pr_diff. For PR metadata and discussion comments, use github_issue.

Examples:
- PR reviews: repo="facebook/react", number=1234

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

    const result = await client.getPullRequestReviews(
      owner,
      repo,
      number,
      signal,
    );

    return {
      content: [{ type: "text" as const, text: result }],
      details: {
        owner,
        repo,
        number,
      },
    };
  },
};
