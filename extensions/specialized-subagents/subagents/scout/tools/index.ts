/**
 * Scout subagent tools.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { webFetchTool } from "../../../lib/tools";
import { downloadGistTool } from "./download-gist";
import { githubCommitsTool } from "./github-commits";
import { githubContentTool } from "./github-content";
import { githubIssueTool } from "./github-issue";
import { githubSearchTool } from "./github-search";
import { listUserReposTool } from "./list-user-repos";
import { uploadGistTool } from "./upload-gist";
import { webSearchTool } from "./web-search";

/** Create scout tools array */
export function createScoutTools(): ToolDefinition[] {
  return [
    webFetchTool,
    webSearchTool,
    githubContentTool,
    githubSearchTool,
    githubCommitsTool,
    githubIssueTool,
    listUserReposTool,
    downloadGistTool,
    uploadGistTool,
  ] as unknown as ToolDefinition[];
}

export {
  downloadGistTool,
  githubCommitsTool,
  githubContentTool,
  githubIssueTool,
  githubSearchTool,
  listUserReposTool,
  uploadGistTool,
  webFetchTool,
  webSearchTool,
};
