/**
 * Upload Gist tool - updates a GitHub Gist from a local directory.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { runGh } from "../../../lib/gh";
import { extractGistId } from "./download-gist";

const parameters = Type.Object({
  gist: Type.String({
    description:
      "GitHub Gist ID or full URL (e.g., 'abc123' or 'https://gist.github.com/user/abc123')",
  }),
  directory: Type.String({
    description: "Path to the directory containing the files to upload",
  }),
});

export const uploadGistTool: ToolDefinition<typeof parameters> = {
  name: "upload_gist",
  label: "Upload Gist",
  description: `Update a GitHub Gist from a local directory.

All files in the directory will be uploaded to the gist.

Note: Gists are flat - subdirectories and hidden files are ignored.`,

  parameters,

  async execute(
    _toolCallId: string,
    args: { gist: string; directory: string },
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const gistId = extractGistId(args.gist);
    const { directory } = args;

    // Read all files (excluding hidden files)
    const entries = await readdir(directory, { withFileTypes: true });
    const files: Record<string, { content: string }> = {};

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".")) {
        continue;
      }
      const content = await readFile(join(directory, entry.name), "utf-8");
      files[entry.name] = { content };
    }

    if (Object.keys(files).length === 0) {
      throw new Error("No files to upload");
    }

    // Update gist via API
    const payload = JSON.stringify({ files });
    await runGh(
      ["api", "-X", "PATCH", `gists/${gistId}`, "--input", "-"],
      signal,
      payload,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `Updated https://gist.github.com/${gistId}`,
        },
      ],
      details: {
        gistId,
        directory,
        files: Object.keys(files),
      },
    };
  },
};
