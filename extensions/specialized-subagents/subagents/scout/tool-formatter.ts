/**
 * Format scout tool calls for display.
 */

import type { SubagentToolCall } from "../../lib/types";

export interface FormattedToolCall {
  label: string;
  detail?: string;
}

/**
 * Format a scout tool call for display.
 *
 * Examples:
 * - web_fetch: "Fetch example.com/path"
 * - web_search: "Search 'typescript best practices'"
 * - github_content: "Content owner/repo/path"
 * - github_search: "Search 'query'"
 * - github_commits: "Commits owner/repo" or "Diff abc1234"
 * - github_issue: "Issue owner/repo#123"
 */
export function formatScoutToolCall(
  toolCall: SubagentToolCall,
): FormattedToolCall {
  const { toolName, args } = toolCall;

  switch (toolName) {
    case "web_fetch": {
      const url = args.url as string | undefined;
      if (url) {
        try {
          const parsed = new URL(url);
          return { label: "Fetch", detail: parsed.hostname + parsed.pathname };
        } catch {
          return { label: "Fetch", detail: url };
        }
      }
      return { label: "Fetch" };
    }

    case "web_search": {
      const query = args.query as string | undefined;
      return { label: "Search", detail: query ? `'${query}'` : undefined };
    }

    case "github_content": {
      const repo = args.repo as string | undefined;
      const path = args.path as string | undefined;
      if (repo) {
        // Extract owner/repo from URL or use as-is
        let repoName = repo;
        try {
          const parsed = new URL(repo);
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) {
            repoName = `${parts[0]}/${parts[1]}`;
          }
        } catch {
          // Not a URL, use as-is
        }
        const detail = path ? `${repoName}/${path}` : repoName;
        return { label: "Content", detail };
      }
      return { label: "Content" };
    }

    case "github_search": {
      const query = args.query as string | undefined;
      const repo = args.repo as string | undefined;
      let detail = query ? `'${query}'` : undefined;
      if (repo && detail) {
        detail += ` in ${repo}`;
      }
      return { label: "Code Search", detail };
    }

    case "github_commits": {
      const repo = args.repo as string | undefined;
      const sha = args.sha as string | undefined;
      if (sha) {
        return { label: "Diff", detail: sha.slice(0, 7) };
      }
      if (repo) {
        // Extract owner/repo from URL or use as-is
        let repoName = repo;
        try {
          const parsed = new URL(repo);
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) {
            repoName = `${parts[0]}/${parts[1]}`;
          }
        } catch {
          // Not a URL, use as-is
        }
        return { label: "Commits", detail: repoName };
      }
      return { label: "Commits" };
    }

    case "github_issue": {
      const repo = args.repo as string | undefined;
      const number = args.number as number | undefined;
      if (repo && number) {
        // Extract owner/repo from URL or use as-is
        let repoName = repo;
        try {
          const parsed = new URL(repo);
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) {
            repoName = `${parts[0]}/${parts[1]}`;
          }
        } catch {
          // Not a URL, use as-is
        }
        return { label: "Issue", detail: `${repoName}#${number}` };
      }
      return { label: "Issue" };
    }

    case "list_user_repos": {
      const username = args.username as string | undefined;
      const language = args.language as string | undefined;
      const namePrefix = args.namePrefix as string | undefined;
      if (username) {
        let detail = `@${username}`;
        const filters: string[] = [];
        if (language) {
          filters.push(language);
        }
        if (namePrefix) {
          filters.push(`${namePrefix}*`);
        }
        if (filters.length > 0) {
          detail += ` (${filters.join(", ")})`;
        }
        return { label: "List Repos", detail };
      }
      return { label: "List Repos" };
    }

    case "download_gist": {
      const gistId = args.gistId as string | undefined;
      if (gistId) {
        // Extract just the ID if it's a URL
        let id = gistId;
        try {
          const parsed = new URL(gistId);
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            id = parts[parts.length - 1];
          }
        } catch {
          // Not a URL, use as-is
        }
        return { label: "Download Gist", detail: id };
      }
      return { label: "Download Gist" };
    }

    case "upload_gist": {
      const directory = args.directory as string | undefined;
      const commitMessage = args.commitMessage as string | undefined;
      if (directory) {
        let detail = directory;
        if (commitMessage) {
          detail += ` - "${commitMessage}"`;
        }
        return { label: "Upload Gist", detail };
      }
      return { label: "Upload Gist" };
    }

    default:
      return { label: toolName };
  }
}
