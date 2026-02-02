/**
 * GitHub Content tool for reading files, listing directories, or getting repo info.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createGitHubClient } from "../../../lib/clients";

const parameters = Type.Object({
  repo: Type.String({
    description:
      "Repository in owner/repo format (e.g., 'facebook/react') or full GitHub URL (e.g., 'https://github.com/facebook/react')",
  }),
  path: Type.Optional(
    Type.String({
      description:
        "File or directory path within the repository. If omitted, returns repository info with README.",
    }),
  ),
  ref: Type.Optional(
    Type.String({
      description:
        "Branch name, tag, or commit SHA. Defaults to the repository's default branch.",
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

export const githubContentTool: ToolDefinition<typeof parameters> = {
  name: "github_content",
  label: "GitHub Content",
  description: `Read files, list directories, or get repository info from GitHub.

Usage:
- Get repo info: provide just the repo (returns README and structure)
- Read a file: provide repo and path to a file
- List directory: provide repo and path to a directory

Examples:
- Repo info: repo="facebook/react"
- Read file: repo="facebook/react", path="README.md"
- List dir: repo="facebook/react", path="packages"
- Specific branch: repo="facebook/react", path="src", ref="main"

Requires: GITHUB_TOKEN environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { repo: string; path?: string; ref?: string },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { repo: repoInput, path, ref } = args;
    const client = createGitHubClient();
    const { owner, repo } = parseRepo(repoInput);

    let markdown: string;
    let contentType: "repo" | "file" | "directory";

    if (!path) {
      // No path provided: fetch repository info
      markdown = await client.fetchRepoInfo(owner, repo, signal);
      contentType = "repo";
    } else {
      // Path provided: try file first, fall back to directory
      try {
        markdown = await client.fetchFileContent(
          owner,
          repo,
          path,
          ref,
          signal,
        );
        contentType = "file";
      } catch (error) {
        // Check if the error indicates it's not a file (i.e., it's a directory)
        if (error instanceof Error && error.message.includes("is not a file")) {
          markdown = await client.fetchDirectoryContent(
            owner,
            repo,
            path,
            ref,
            signal,
          );
          contentType = "directory";
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    }

    return {
      content: [{ type: "text" as const, text: markdown }],
      details: {
        owner,
        repo,
        path: path || null,
        ref: ref || null,
        contentType,
      },
    };
  },
};
