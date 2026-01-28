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
 * - github_issues: "Issues owner/repo (open, pr)"
 * - github_pr_diff: "PR Diff owner/repo#123"
 * - github_pr_reviews: "PR Reviews owner/repo#123"
 * - github_compare: "Compare owner/repo main...feature"
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

    case "github_issues": {
      const repo = args.repo as string | undefined;
      const state = args.state as string | undefined;
      const type = args.type as string | undefined;
      if (repo) {
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
        const filters: string[] = [];
        if (state && state !== "open") {
          filters.push(state);
        }
        if (type && type !== "all") {
          filters.push(type);
        }
        const detail =
          filters.length > 0 ? `${repoName} (${filters.join(", ")})` : repoName;
        return { label: "Issues", detail };
      }
      return { label: "Issues" };
    }

    case "github_pr_diff": {
      const repo = args.repo as string | undefined;
      const number = args.number as number | undefined;
      if (repo && number) {
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
        return { label: "PR Diff", detail: `${repoName}#${number}` };
      }
      return { label: "PR Diff" };
    }

    case "github_pr_reviews": {
      const repo = args.repo as string | undefined;
      const number = args.number as number | undefined;
      if (repo && number) {
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
        return { label: "PR Reviews", detail: `${repoName}#${number}` };
      }
      return { label: "PR Reviews" };
    }

    case "github_compare": {
      const repo = args.repo as string | undefined;
      const base = args.base as string | undefined;
      const head = args.head as string | undefined;
      if (repo && base && head) {
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
        return { label: "Compare", detail: `${repoName} ${base}...${head}` };
      }
      return { label: "Compare" };
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
      const gist = args.gist as string | undefined;
      return { label: "Download Gist", detail: gist };
    }

    case "upload_gist": {
      const gist = args.gist as string | undefined;
      return { label: "Upload Gist", detail: gist };
    }

    default:
      return { label: toolName };
  }
}
