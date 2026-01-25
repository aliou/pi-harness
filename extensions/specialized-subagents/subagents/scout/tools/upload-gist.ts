/**
 * Upload Gist tool - updates a GitHub Gist by pushing changes from a directory.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const parameters = Type.Object({
  directory: Type.String({
    description:
      "Path to the directory containing the files to upload/update in the Gist",
  }),
  commitMessage: Type.Optional(
    Type.String({
      description:
        "Commit message for the update (defaults to 'Update gist files')",
    }),
  ),
});

/**
 * Check if a directory is a git repository with a remote.
 */
function validateGitRepo(directory: string): {
  isGist: boolean;
  remoteUrl?: string;
  gistId?: string;
} {
  try {
    // Check if it's a git repository
    const gitDir = execSync(`git -C "${directory}" rev-parse --git-dir`, {
      stdio: "pipe",
      encoding: "utf-8",
    })
      .toString()
      .trim();

    if (!gitDir) {
      return { isGist: false };
    }

    // Get the remote URL
    const remoteUrl = execSync(`git -C "${directory}" remote get-url origin`, {
      stdio: "pipe",
      encoding: "utf-8",
    })
      .toString()
      .trim();

    // Check if it's a Gist URL
    // Gist URLs are like: https://gist.github.com/<gistId>.git
    const gistMatch = remoteUrl.match(
      /gist\.github\.com[/:]([a-zA-Z0-9]+)\.git/,
    );
    if (!gistMatch) {
      return { isGist: false, remoteUrl };
    }

    return {
      isGist: true,
      remoteUrl,
      gistId: gistMatch[1],
    };
  } catch {
    return { isGist: false };
  }
}

export const uploadGistTool: ToolDefinition<typeof parameters> = {
  name: "upload_gist",
  label: "Upload Gist",
  description: `Update a GitHub Gist by pushing changes from a local directory.

The directory must be a git repository that was cloned from a Gist (e.g., using download_gist).
All changes in the directory will be committed and pushed to the Gist.

Note: Gists are flat repositories - they cannot contain subdirectories. All files must be in the root of the directory.

Usage:
- Provide directory path: directory="/tmp/gist-abc123def456-xyz"
- Optional commit message: commitMessage="Updated configuration"

Requires: Git configured with GitHub authentication (HTTPS or SSH)`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { directory: string; commitMessage?: string },
    _onUpdate: unknown,
    _ctx: unknown,
    signal?: AbortSignal,
  ) {
    const { directory: dirInput, commitMessage = "Update gist files" } = args;

    // Resolve to absolute path
    const directory = resolve(dirInput);

    // Check if directory exists
    if (!existsSync(directory)) {
      throw new Error(`Directory does not exist: ${directory}`);
    }

    // Check if it's a directory
    if (!statSync(directory).isDirectory()) {
      throw new Error(`Not a directory: ${directory}`);
    }

    // Validate it's a Gist repository
    const repoInfo = validateGitRepo(directory);
    if (!repoInfo.isGist) {
      throw new Error(
        `Directory is not a cloned Gist repository: ${directory}` +
          (repoInfo.remoteUrl
            ? `\nRemote URL: ${repoInfo.remoteUrl}`
            : "\nNo git remote found."),
      );
    }

    const { gistId, remoteUrl } = repoInfo;

    // Check if signal is already aborted
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    try {
      // Add all changes
      execSync(`git -C "${directory}" add -A`, {
        stdio: "pipe",
        encoding: "utf-8",
      });

      // Check if there are changes to commit
      let hasChanges = false;
      try {
        execSync(`git -C "${directory}" diff --cached --quiet`, {
          stdio: "pipe",
          encoding: "utf-8",
        });
      } catch {
        // Non-zero exit means there are changes
        hasChanges = true;
      }

      if (!hasChanges) {
        let markdown = `# No Changes to Upload\n\n`;
        markdown += `**Gist ID:** ${gistId}\n`;
        markdown += `**Directory:** \`${directory}\`\n`;
        markdown += `**URL:** https://gist.github.com/${gistId}\n\n`;
        markdown += `_No changes detected in the directory._\n`;

        return {
          content: [{ type: "text" as const, text: markdown }],
          details: {
            gistId,
            directory,
            url: `https://gist.github.com/${gistId}`,
            hasChanges: false,
          },
        };
      }

      // Commit changes
      execSync(`git -C "${directory}" commit -m "${commitMessage}"`, {
        stdio: "pipe",
        encoding: "utf-8",
      });

      // Get the current branch name
      const currentBranch = execSync(
        `git -C "${directory}" rev-parse --abbrev-ref HEAD`,
        {
          stdio: "pipe",
          encoding: "utf-8",
        },
      )
        .toString()
        .trim();

      // Push to remote
      const pushOutput = execSync(
        `git -C "${directory}" push origin ${currentBranch}`,
        {
          stdio: "pipe",
          encoding: "utf-8",
        },
      ).toString();

      // Get the latest commit info
      const commitInfo = execSync(
        `git -C "${directory}" log -1 --pretty=format:"%H%n%an%n%ae%n%ai%n%s"`,
        {
          stdio: "pipe",
          encoding: "utf-8",
        },
      ).toString();

      const [commitHash, authorName, authorEmail, commitDate, commitSubject] =
        commitInfo.split("\n");

      let markdown = `# Gist Updated\n\n`;
      markdown += `**Gist ID:** ${gistId}\n`;
      markdown += `**Directory:** \`${directory}\`\n`;
      markdown += `**URL:** https://gist.github.com/${gistId}\n\n`;
      markdown += `## Commit Details\n\n`;
      markdown += `- **Hash:** \`${commitHash?.substring(0, 7)}\`\n`;
      markdown += `- **Author:** ${authorName} <${authorEmail}>\n`;
      markdown += `- **Date:** ${commitDate}\n`;
      markdown += `- **Message:** ${commitSubject}\n\n`;

      if (pushOutput.trim()) {
        markdown += `## Push Output\n\n`;
        markdown += `\`\`\`\n${pushOutput}\`\`\`\n`;
      }

      return {
        content: [{ type: "text" as const, text: markdown }],
        details: {
          gistId,
          directory,
          url: `https://gist.github.com/${gistId}`,
          hasChanges: true,
          commitHash: commitHash?.substring(0, 7),
          commitMessage: commitSubject,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to update Gist ${gistId}: ${errorMessage}`,
      );
    }
  },
};
