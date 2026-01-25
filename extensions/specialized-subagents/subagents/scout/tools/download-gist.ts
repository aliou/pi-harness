/**
 * Download Gist tool - clones a GitHub Gist to a temporary directory.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const parameters = Type.Object({
  gistId: Type.String({
    description:
      "GitHub Gist ID or full Gist URL (e.g., 'abc123def456' or 'https://gist.github.com/username/abc123def456')",
  }),
});

/**
 * Extract Gist ID from input string.
 * Handles both raw IDs and full URLs.
 */
function extractGistId(input: string): string {
  // If it's a URL, extract the ID
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const url = new URL(input);
      if (!url.hostname.includes("gist.github.com")) {
        throw new Error(`Not a GitHub Gist URL: ${input}`);
      }
      const parts = url.pathname.split("/").filter(Boolean);
      // URL format: https://gist.github.com/username/gistId
      if (parts.length < 2) {
        throw new Error(`Invalid Gist URL: ${input}`);
      }
      return parts[parts.length - 1]; // Last part is the Gist ID
    } catch (error) {
      if (error instanceof Error && error.message.includes("Gist")) {
        throw error;
      }
      throw new Error(`Invalid Gist URL: ${input}`);
    }
  }

  // Otherwise, treat as raw Gist ID
  // Validate format (alphanumeric)
  if (!/^[a-zA-Z0-9]+$/.test(input)) {
    throw new Error(`Invalid Gist ID format: ${input}`);
  }

  return input;
}

export const downloadGistTool: ToolDefinition<typeof parameters> = {
  name: "download_gist",
  label: "Download Gist",
  description: `Clone a GitHub Gist to a temporary directory.

Returns the path to the temporary directory containing the cloned Gist.

Usage:
- Provide Gist ID: gistId="abc123def456"
- Provide full URL: gistId="https://gist.github.com/username/abc123def456"

Note: The temporary directory is created in the system's temp folder and will need to be cleaned up manually if desired.`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { gistId: string },
    _onUpdate: unknown,
    _ctx: unknown,
    signal?: AbortSignal,
  ) {
    const { gistId: gistInput } = args;
    const gistId = extractGistId(gistInput);

    // Create temporary directory
    const tempDir = mkdtempSync(join(tmpdir(), `gist-${gistId}-`));

    try {
      // Clone the Gist using git
      const gistUrl = `https://gist.github.com/${gistId}.git`;

      // Check if signal is already aborted
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      // Clone the repository
      execSync(`git clone "${gistUrl}" "${tempDir}"`, {
        stdio: "pipe",
        encoding: "utf-8",
      });

      // List files in the cloned directory
      const files = execSync(`ls -la "${tempDir}"`, {
        stdio: "pipe",
        encoding: "utf-8",
      }).toString();

      let markdown = `# Gist Downloaded\n\n`;
      markdown += `**Gist ID:** ${gistId}\n`;
      markdown += `**Directory:** \`${tempDir}\`\n`;
      markdown += `**URL:** https://gist.github.com/${gistId}\n\n`;
      markdown += `## Files\n\n`;
      markdown += `\`\`\`\n${files}\`\`\`\n`;

      return {
        content: [{ type: "text" as const, text: markdown }],
        details: {
          gistId,
          directory: tempDir,
          url: `https://gist.github.com/${gistId}`,
        },
      };
    } catch (error) {
      // If cloning failed, we should report the error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clone Gist ${gistId}: ${errorMessage}`);
    }
  },
};
