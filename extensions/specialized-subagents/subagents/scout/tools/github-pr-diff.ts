/**
 * GitHub PR Diff tool for fetching changed files and patches for a pull request.
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

export const githubPrDiffTool: ToolDefinition<typeof parameters> = {
  name: "github_pr_diff",
  label: "GitHub PR Diff",
  description: `Fetch the diff (changed files with patches) for a pull request.

Use this to see the actual code changes in a PR. For PR metadata and comments, use github_issue. For inline review comments, use github_pr_reviews.

Examples:
- PR diff: repo="facebook/react", number=1234

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

    const result = await client.getPullRequestDiff(owner, repo, number, signal);

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
