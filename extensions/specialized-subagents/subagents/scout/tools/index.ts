/**
 * Scout subagent tools.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { webFetchTool } from "../../../lib/tools";
import { downloadGistTool } from "./download-gist";
import { githubCommitsTool } from "./github-commits";
import { githubCompareTool } from "./github-compare";
import { githubContentTool } from "./github-content";
import { githubIssueTool } from "./github-issue";
import { githubIssuesTool } from "./github-issues";
import { githubPrDiffTool } from "./github-pr-diff";
import { githubPrReviewsTool } from "./github-pr-reviews";
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
    githubIssuesTool,
    githubPrDiffTool,
    githubPrReviewsTool,
    githubCompareTool,
    listUserReposTool,
    downloadGistTool,
    uploadGistTool,
  ] as unknown as ToolDefinition[];
}

export {
  downloadGistTool,
  githubCommitsTool,
  githubCompareTool,
  githubContentTool,
  githubIssueTool,
  githubIssuesTool,
  githubPrDiffTool,
  githubPrReviewsTool,
  githubSearchTool,
  listUserReposTool,
  uploadGistTool,
  webFetchTool,
  webSearchTool,
};
