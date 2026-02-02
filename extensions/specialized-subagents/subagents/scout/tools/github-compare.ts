/**
 * GitHub Compare tool for comparing two branches, tags, or commits.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  repo: Type.String({
    description:
      "Repository in owner/repo format (e.g., 'facebook/react') or full GitHub URL",
  }),
  base: Type.String({
    description: "Base branch, tag, or commit SHA",
  }),
  head: Type.String({
    description: "Head branch, tag, or commit SHA to compare against base",
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

export const githubCompareTool: ToolDefinition<typeof parameters> = {
  name: "github_compare",
  label: "GitHub Compare",
  description: `Compare two branches, tags, or commits in a repository.

Shows the commits and file diffs between two refs. Useful for seeing what changed between branches or releases.

Examples:
- Compare branches: repo="facebook/react", base="main", head="feature-branch"
- Compare tags: repo="facebook/react", base="v18.0.0", head="v18.1.0"
- Compare commits: repo="facebook/react", base="abc1234", head="def5678"

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { repo: string; base: string; head: string },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { repo: repoInput, base, head } = args;
    const client = createGitHubClient();
    const { owner, repo } = parseRepo(repoInput);

    const result = await client.compareRefs(owner, repo, base, head, signal);

    return {
      content: [{ type: "text" as const, text: result }],
      details: {
        owner,
        repo,
        base,
        head,
      },
    };
  },
};
