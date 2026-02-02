/**
 * Download Gist tool - fetches a GitHub Gist to a temporary directory.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { runGh } from "../../../lib/gh";

const parameters = Type.Object({
  gist: Type.String({
    description:
      "GitHub Gist ID or full URL (e.g., 'abc123' or 'https://gist.github.com/user/abc123')",
  }),
});

interface GistFile {
  filename: string;
  content: string;
}

interface GistResponse {
  id: string;
  files: Record<string, GistFile>;
}

/**
 * Extract Gist ID from input string.
 */
export function extractGistId(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const url = new URL(input);
    if (!url.hostname.includes("gist.github.com")) {
      throw new Error(`Not a GitHub Gist URL: ${input}`);
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const gistId = parts[parts.length - 1];
    if (!gistId) {
      throw new Error(`Invalid Gist URL: ${input}`);
    }
    return gistId;
  }

  if (!/^[a-zA-Z0-9]+$/.test(input)) {
    throw new Error(`Invalid Gist ID format: ${input}`);
  }

  return input;
}

export const downloadGistTool: ToolDefinition<typeof parameters> = {
  name: "download_gist",
  label: "Download Gist",
  description: `Download a GitHub Gist to a temporary directory.

Returns the path to the directory containing the gist files.

Usage:
- Gist ID: gist="abc123def456"
- Full URL: gist="https://gist.github.com/username/abc123def456"`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { gist: string },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const gistId = extractGistId(args.gist);

    // Fetch gist via gh api
    const json = await runGh(["api", `gists/${gistId}`], signal);
    const gist: GistResponse = JSON.parse(json);

    // Create temp directory
    const tempDir = join(tmpdir(), `gist-${gistId}-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Write all files
    for (const file of Object.values(gist.files)) {
      await writeFile(join(tempDir, file.filename), file.content);
    }

    return {
      content: [{ type: "text" as const, text: tempDir }],
      details: {
        gistId,
        directory: tempDir,
      },
    };
  },
};
