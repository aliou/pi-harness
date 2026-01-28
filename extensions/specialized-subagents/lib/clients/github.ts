/**
 * Lightweight GitHub API client.
 */

const GITHUB_BASE_URL = "https://api.github.com";

/** GitHub repository info */
export interface GitHubRepository {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { name: string } | null;
  default_branch: string;
  open_issues_count: number;
  topics: string[];
}

/** GitHub directory item */
export interface GitHubDirectoryItem {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  html_url: string;
}

/** GitHub file content */
export interface GitHubFileContent {
  name: string;
  path: string;
  type: string;
  size: number;
  content?: string;
  encoding?: string;
}

/** GitHub README */
export interface GitHubReadme {
  content: string;
  encoding: string;
}

/** GitHub user */
export interface GitHubUser {
  login: string;
  html_url: string;
}

/** GitHub label */
export interface GitHubLabel {
  name: string;
  color: string;
}

/** GitHub issue */
export interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  body: string | null;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  html_url: string;
}

/** GitHub PR */
export interface GitHubPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  body: string | null;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  html_url: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  mergeable: boolean | null;
  draft: boolean;
}

/** GitHub comment */
export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

/** GitHub PR review comment (inline on code) */
export interface GitHubReviewComment {
  id: number;
  body: string;
  user: GitHubUser;
  path: string;
  line: number | null;
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  diff_hunk: string;
  created_at: string;
  updated_at: string;
  in_reply_to_id?: number;
  pull_request_review_id: number | null;
}

/** GitHub PR review */
export interface GitHubReview {
  id: number;
  user: GitHubUser;
  body: string | null;
  state:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "DISMISSED"
    | "PENDING";
  submitted_at: string;
  html_url: string;
}

/** GitHub compare response */
export interface GitHubCompareResponse {
  status: "diverged" | "ahead" | "behind" | "identical";
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  commits: GitHubCommit[];
  files: GitHubCommitFile[];
}

/** GitHub code search result item */
export interface GitHubCodeSearchItem {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: {
    full_name: string;
    html_url: string;
  };
}

/** GitHub code search response */
export interface GitHubCodeSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubCodeSearchItem[];
}

/** GitHub commit author */
export interface GitHubCommitAuthor {
  name: string;
  email: string;
  date: string;
}

/** GitHub commit */
export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: GitHubCommitAuthor;
    committer: GitHubCommitAuthor;
  };
  author: GitHubUser | null;
  committer: GitHubUser | null;
}

/** GitHub commit search result item */
export interface GitHubCommitSearchItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: GitHubCommitAuthor;
    committer: GitHubCommitAuthor;
  };
  author: GitHubUser | null;
  repository: {
    full_name: string;
  };
}

/** GitHub commit search response */
export interface GitHubCommitSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubCommitSearchItem[];
}

/** GitHub commit file (for diff) */
export interface GitHubCommitFile {
  sha: string;
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

/** GitHub commit detail (with diff) */
export interface GitHubCommitDetail {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: GitHubCommitAuthor;
    committer: GitHubCommitAuthor;
  };
  author: GitHubUser | null;
  committer: GitHubUser | null;
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
  files: GitHubCommitFile[];
}

/** Parsed GitHub URL */
export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  type: "repo" | "file" | "directory" | "tree" | "issue" | "pull";
  path?: string;
  ref?: string;
  number?: number;
}

/** Language mapping for syntax highlighting */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  md: "markdown",
  markdown: "markdown",
};

export class GitHubClient {
  private token: string;

  constructor() {
    const token = process.env.SCOUT_GITHUB_TOKEN;
    if (!token) {
      throw new Error("SCOUT_GITHUB_TOKEN environment variable is not set.");
    }
    this.token = token;
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = new URL(`${GITHUB_BASE_URL}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${this.token}`,
      },
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404) {
        throw new Error(`Not found: ${endpoint}`);
      }
      if (response.status === 403 || response.status === 429) {
        throw new Error(`Rate limit exceeded or access denied: ${text}`);
      }
      if (response.status === 401) {
        throw new Error(
          "Authentication failed. Check SCOUT_GITHUB_TOKEN validity.",
        );
      }
      throw new Error(`GitHub API error (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /** Fetch repository info with README */
  async fetchRepoInfo(
    owner: string,
    repo: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const repoData = await this.get<GitHubRepository>(
      `/repos/${owner}/${repo}`,
      undefined,
      signal,
    );

    let markdown = `# ${repoData.full_name}\n\n`;

    if (repoData.description) {
      markdown += `${repoData.description}\n\n`;
    }

    markdown += `## Repository Info\n\n`;
    markdown += `- **Stars:** ${repoData.stargazers_count}\n`;
    markdown += `- **Forks:** ${repoData.forks_count}\n`;
    markdown += `- **Language:** ${repoData.language || "Not specified"}\n`;
    markdown += `- **License:** ${repoData.license?.name || "Not specified"}\n`;
    markdown += `- **Default Branch:** ${repoData.default_branch}\n`;
    markdown += `- **Open Issues:** ${repoData.open_issues_count}\n`;

    if (repoData.topics.length > 0) {
      markdown += `- **Topics:** ${repoData.topics.join(", ")}\n`;
    }

    markdown += `\n`;

    // Try to fetch README
    try {
      const readme = await this.get<GitHubReadme>(
        `/repos/${owner}/${repo}/readme`,
        undefined,
        signal,
      );
      const readmeContent = Buffer.from(readme.content, "base64").toString(
        "utf-8",
      );
      markdown += `## README\n\n${readmeContent}\n`;
    } catch {
      // README not found, skip
    }

    // Fetch root directory structure
    try {
      const items = await this.get<GitHubDirectoryItem[]>(
        `/repos/${owner}/${repo}/contents`,
        undefined,
        signal,
      );

      markdown += `## Repository Structure\n\n`;
      for (const item of items) {
        const icon = item.type === "dir" ? "[d]" : "[f]";
        markdown += `- ${icon} ${item.name}\n`;
      }
    } catch {
      // Failed to fetch structure, skip
    }

    return markdown;
  }

  /** Fetch file content */
  async fetchFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const params: Record<string, string> = {};
    if (ref) {
      params.ref = ref;
    }

    const data = await this.get<GitHubFileContent>(
      `/repos/${owner}/${repo}/contents/${path}`,
      Object.keys(params).length > 0 ? params : undefined,
      signal,
    );

    if (data.type !== "file") {
      throw new Error(`Path ${path} is not a file`);
    }

    if (!data.content || !data.encoding) {
      throw new Error(`File ${path} has no content`);
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    let markdown = `# ${data.name}\n\n`;
    markdown += `**Path:** \`${data.path}\`\n`;
    markdown += `**Size:** ${data.size} bytes\n\n`;

    const ext = path.split(".").pop()?.toLowerCase() || "";
    const lang = EXTENSION_TO_LANGUAGE[ext] || "";
    markdown += `\`\`\`${lang}\n${content}\n\`\`\`\n`;

    return markdown;
  }

  /** Fetch directory listing */
  async fetchDirectoryContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const params: Record<string, string> = {};
    if (ref) {
      params.ref = ref;
    }

    const items = await this.get<GitHubDirectoryItem[]>(
      `/repos/${owner}/${repo}/contents/${path}`,
      Object.keys(params).length > 0 ? params : undefined,
      signal,
    );

    let markdown = `# ${owner}/${repo}/${path}\n\n`;
    markdown += `## Contents\n\n`;

    // Sort: directories first, then files
    const sorted = items.sort((a, b) => {
      if (a.type === "dir" && b.type !== "dir") return -1;
      if (a.type !== "dir" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of sorted) {
      const icon = item.type === "dir" ? "[d]" : "[f]";
      markdown += `- ${icon} ${item.name}`;
      if (item.type === "file" && item.size > 0) {
        markdown += ` (${item.size} bytes)`;
      }
      markdown += `\n`;
    }

    return markdown;
  }

  /** Fetch issue with comments */
  async fetchIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const issue = await this.get<GitHubIssue>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      undefined,
      signal,
    );

    let markdown = `# Issue #${issue.number}: ${issue.title}\n\n`;

    markdown += `**State:** ${issue.state}\n`;
    markdown += `**Author:** [@${issue.user.login}](${issue.user.html_url})\n`;
    markdown += `**Created:** ${issue.created_at}\n`;
    markdown += `**Updated:** ${issue.updated_at}\n`;

    if (issue.closed_at) {
      markdown += `**Closed:** ${issue.closed_at}\n`;
    }

    if (issue.labels.length > 0) {
      markdown += `**Labels:** ${issue.labels.map((l) => l.name).join(", ")}\n`;
    }

    if (issue.assignees.length > 0) {
      markdown += `**Assignees:** ${issue.assignees.map((a) => `@${a.login}`).join(", ")}\n`;
    }

    markdown += `**URL:** ${issue.html_url}\n\n`;

    markdown += `## Description\n\n`;
    markdown += issue.body || "_No description provided._";
    markdown += `\n\n`;

    // Fetch comments if any
    if (issue.comments > 0) {
      try {
        const comments = await this.get<GitHubComment[]>(
          `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
          { per_page: "100" },
          signal,
        );

        markdown += `## Comments (${comments.length})\n\n`;

        for (const comment of comments) {
          markdown += `### @${comment.user.login} - ${comment.created_at}\n\n`;
          markdown += `${comment.body}\n\n`;
          markdown += `---\n\n`;
        }
      } catch {
        markdown += `_Failed to load ${issue.comments} comments._\n\n`;
      }
    }

    return markdown;
  }

  /** Fetch pull request with comments */
  async fetchPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const pr = await this.get<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`,
      undefined,
      signal,
    );

    let markdown = `# PR #${pr.number}: ${pr.title}\n\n`;

    // Determine state
    let state = pr.state;
    if (pr.merged_at) {
      state = "merged";
    }

    markdown += `**State:** ${state}${pr.draft ? " (draft)" : ""}\n`;
    markdown += `**Author:** [@${pr.user.login}](${pr.user.html_url})\n`;
    markdown += `**Branch:** \`${pr.head.ref}\` → \`${pr.base.ref}\`\n`;
    markdown += `**Created:** ${pr.created_at}\n`;
    markdown += `**Updated:** ${pr.updated_at}\n`;

    if (pr.merged_at) {
      markdown += `**Merged:** ${pr.merged_at}\n`;
    } else if (pr.closed_at) {
      markdown += `**Closed:** ${pr.closed_at}\n`;
    }

    if (pr.labels.length > 0) {
      markdown += `**Labels:** ${pr.labels.map((l) => l.name).join(", ")}\n`;
    }

    if (pr.assignees.length > 0) {
      markdown += `**Assignees:** ${pr.assignees.map((a) => `@${a.login}`).join(", ")}\n`;
    }

    markdown += `\n`;
    markdown += `**Stats:** +${pr.additions} -${pr.deletions} in ${pr.changed_files} files (${pr.commits} commits)\n`;
    markdown += `**URL:** ${pr.html_url}\n\n`;

    markdown += `## Description\n\n`;
    markdown += pr.body || "_No description provided._";
    markdown += `\n\n`;

    // Fetch comments if any
    if (pr.comments > 0) {
      try {
        const comments = await this.get<GitHubComment[]>(
          `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
          { per_page: "100" },
          signal,
        );

        markdown += `## Comments (${comments.length})\n\n`;

        for (const comment of comments) {
          markdown += `### @${comment.user.login} - ${comment.created_at}\n\n`;
          markdown += `${comment.body}\n\n`;
          markdown += `---\n\n`;
        }
      } catch {
        markdown += `_Failed to load comments._\n\n`;
      }
    }

    return markdown;
  }

  /** Search code across GitHub */
  async searchCode(
    query: string,
    repo?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    // Build search query
    let q = query;
    if (repo) {
      q = `${query} repo:${repo}`;
    }

    const data = await this.get<GitHubCodeSearchResponse>(
      "/search/code",
      { q, per_page: "30" },
      signal,
    );

    let markdown = `# Code Search Results\n\n`;
    markdown += `**Query:** \`${query}\`\n`;
    if (repo) {
      markdown += `**Repository:** ${repo}\n`;
    }
    markdown += `**Total Results:** ${data.total_count}${data.incomplete_results ? " (incomplete)" : ""}\n\n`;

    if (data.items.length === 0) {
      markdown += `_No code matching the query was found._\n`;
      return markdown;
    }

    markdown += `## Results\n\n`;

    for (const item of data.items) {
      markdown += `### ${item.path}\n\n`;
      markdown += `- **Repository:** ${item.repository.full_name}\n`;
      markdown += `- **URL:** ${item.html_url}\n\n`;
    }

    return markdown;
  }

  /** List repositories for a user */
  async listUserRepos(
    username: string,
    options?: {
      language?: string;
      namePrefix?: string;
      sort?: string;
      order?: string;
      per_page?: number;
      page?: number;
    },
    signal?: AbortSignal,
  ): Promise<string> {
    // Build search query
    let q = `user:${username}`;
    if (options?.language) {
      q += ` language:${options.language}`;
    }
    if (options?.namePrefix) {
      q += ` ${options.namePrefix} in:name`;
    }

    const params: Record<string, string> = {
      q,
      per_page: String(options?.per_page ?? 30),
      page: String(options?.page ?? 1),
    };
    if (options?.sort) {
      params.sort = options.sort;
    }
    if (options?.order) {
      params.order = options.order;
    }

    const data = await this.get<{
      total_count: number;
      incomplete_results: boolean;
      items: GitHubRepository[];
    }>("/search/repositories", params, signal);

    let markdown = `# Repositories for @${username}\n\n`;
    markdown += `**Total Results:** ${data.total_count}${data.incomplete_results ? " (incomplete)" : ""}\n\n`;

    if (data.items.length === 0) {
      markdown += `_No repositories found._\n`;
      return markdown;
    }

    markdown += `## Repositories\n\n`;

    for (const repo of data.items) {
      markdown += `### [${repo.full_name}](${`https://github.com/${repo.full_name}`})\n\n`;
      markdown += `- **Stars:** ${repo.stargazers_count}\n`;
      markdown += `- **Forks:** ${repo.forks_count}\n`;
      if (repo.language) {
        markdown += `- **Language:** ${repo.language}\n`;
      }
      if (repo.license) {
        markdown += `- **License:** ${repo.license.name}\n`;
      }
      if (repo.description) {
        markdown += `- **Description:** ${repo.description}\n`;
      }
      if (repo.topics.length > 0) {
        markdown += `- **Topics:** ${repo.topics.join(", ")}\n`;
      }
      markdown += `\n`;
    }

    return markdown;
  }

  /** Search commits in a repository */
  async searchCommits(
    owner: string,
    repo: string,
    options?: { query?: string; author?: string; path?: string },
    signal?: AbortSignal,
  ): Promise<string> {
    // If we have a query, use the search API
    if (options?.query) {
      let q = `${options.query} repo:${owner}/${repo}`;
      if (options.author) {
        q += ` author:${options.author}`;
      }

      const data = await this.get<GitHubCommitSearchResponse>(
        "/search/commits",
        { q, per_page: "30" },
        signal,
      );

      let markdown = `# Commit Search Results\n\n`;
      markdown += `**Repository:** ${owner}/${repo}\n`;
      markdown += `**Query:** \`${options.query}\`\n`;
      if (options.author) {
        markdown += `**Author:** ${options.author}\n`;
      }
      markdown += `**Total Results:** ${data.total_count}${data.incomplete_results ? " (incomplete)" : ""}\n\n`;

      if (data.items.length === 0) {
        markdown += `_No commits matching the query were found._\n`;
        return markdown;
      }

      markdown += `## Commits\n\n`;

      for (const item of data.items) {
        const shortSha = item.sha.substring(0, 7);
        const message = item.commit.message.split("\n")[0]; // First line only
        const date = item.commit.author.date.split("T")[0];
        const author = item.author?.login || item.commit.author.name;

        markdown += `- **${shortSha}** (${date}) - ${author}: ${message}\n`;
      }

      return markdown;
    }

    // Otherwise use the commits list API which supports path and author filtering
    const params: Record<string, string> = { per_page: "30" };
    if (options?.author) {
      params.author = options.author;
    }
    if (options?.path) {
      params.path = options.path;
    }

    const commits = await this.get<GitHubCommit[]>(
      `/repos/${owner}/${repo}/commits`,
      params,
      signal,
    );

    let markdown = `# Commits\n\n`;
    markdown += `**Repository:** ${owner}/${repo}\n`;
    if (options?.author) {
      markdown += `**Author:** ${options.author}\n`;
    }
    if (options?.path) {
      markdown += `**Path:** ${options.path}\n`;
    }
    markdown += `\n`;

    if (commits.length === 0) {
      markdown += `_No commits found._\n`;
      return markdown;
    }

    markdown += `## Commits\n\n`;

    for (const commit of commits) {
      const shortSha = commit.sha.substring(0, 7);
      const message = commit.commit.message.split("\n")[0]; // First line only
      const date = commit.commit.author.date.split("T")[0];
      const author = commit.author?.login || commit.commit.author.name;

      markdown += `- **${shortSha}** (${date}) - ${author}: ${message}\n`;
    }

    return markdown;
  }

  /** List issues and/or PRs in a repository */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      labels?: string;
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      type?: "issue" | "pr" | "all";
      author?: string;
      assignee?: string;
      milestone?: string;
      per_page?: number;
      page?: number;
    },
    signal?: AbortSignal,
  ): Promise<string> {
    const params: Record<string, string> = {
      state: options?.state ?? "open",
      sort: options?.sort ?? "created",
      direction: options?.direction ?? "desc",
      per_page: String(options?.per_page ?? 30),
      page: String(options?.page ?? 1),
    };
    if (options?.labels) {
      params.labels = options.labels;
    }
    if (options?.assignee) {
      params.assignee = options.assignee;
    }
    if (options?.milestone) {
      params.milestone = options.milestone;
    }

    const issues = await this.get<GitHubIssue[]>(
      `/repos/${owner}/${repo}/issues`,
      params,
      signal,
    );

    // GitHub Issues API returns both issues and PRs. PRs have a pull_request key.
    const typeFilter = options?.type ?? "all";
    const authorFilter = options?.author;

    const filtered = issues.filter((issue) => {
      const isPr = "pull_request" in issue;
      if (typeFilter === "issue" && isPr) return false;
      if (typeFilter === "pr" && !isPr) return false;
      if (authorFilter && issue.user.login !== authorFilter) return false;
      return true;
    });

    const stateLabel = options?.state ?? "open";
    const typeLabel =
      typeFilter === "issue"
        ? "Issues"
        : typeFilter === "pr"
          ? "Pull Requests"
          : "Issues & PRs";

    let markdown = `# ${typeLabel} - ${owner}/${repo}\n\n`;
    markdown += `**State:** ${stateLabel}\n`;
    if (options?.labels) {
      markdown += `**Labels:** ${options.labels}\n`;
    }
    if (authorFilter) {
      markdown += `**Author:** ${authorFilter}\n`;
    }
    if (options?.assignee) {
      markdown += `**Assignee:** ${options.assignee}\n`;
    }
    markdown += `**Showing:** ${filtered.length} results\n\n`;

    if (filtered.length === 0) {
      markdown += `_No matching items found._\n`;
      return markdown;
    }

    for (const issue of filtered) {
      const isPr = "pull_request" in issue;
      const prefix = isPr ? "PR" : "Issue";
      const labels =
        issue.labels.length > 0
          ? ` [${issue.labels.map((l) => l.name).join(", ")}]`
          : "";
      const date = issue.created_at.split("T")[0];
      markdown += `- **#${issue.number}** (${prefix}) ${issue.title}${labels} - @${issue.user.login} (${date})\n`;
    }

    return markdown;
  }

  /** Get PR diff (changed files with patches) */
  async getPullRequestDiff(
    owner: string,
    repo: string,
    prNumber: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const files = await this.get<GitHubCommitFile[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      { per_page: "100" },
      signal,
    );

    // Also fetch PR metadata for context
    const pr = await this.get<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`,
      undefined,
      signal,
    );

    let state = pr.state;
    if (pr.merged_at) {
      state = "merged";
    }

    let markdown = `# PR #${pr.number} Diff: ${pr.title}\n\n`;
    markdown += `**State:** ${state}${pr.draft ? " (draft)" : ""}\n`;
    markdown += `**Branch:** \`${pr.head.ref}\` -> \`${pr.base.ref}\`\n`;
    markdown += `**Stats:** +${pr.additions} -${pr.deletions} in ${pr.changed_files} files\n`;
    markdown += `**URL:** ${pr.html_url}\n\n`;

    markdown += `## Changed Files (${files.length})\n\n`;

    for (const file of files) {
      const statusIcon =
        file.status === "added"
          ? "[+]"
          : file.status === "removed"
            ? "[-]"
            : file.status === "renamed"
              ? "[R]"
              : "[M]";

      markdown += `### ${statusIcon} ${file.filename}\n\n`;

      if (file.previous_filename) {
        markdown += `_Renamed from: ${file.previous_filename}_\n\n`;
      }

      markdown += `**Status:** ${file.status} (+${file.additions} -${file.deletions})\n\n`;

      if (file.patch) {
        markdown += `\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
      }
    }

    return markdown;
  }

  /** Get PR review comments (inline code comments) */
  async getPullRequestReviews(
    owner: string,
    repo: string,
    prNumber: number,
    signal?: AbortSignal,
  ): Promise<string> {
    // Fetch reviews and inline comments in parallel
    const [reviews, reviewComments] = await Promise.all([
      this.get<GitHubReview[]>(
        `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        { per_page: "100" },
        signal,
      ),
      this.get<GitHubReviewComment[]>(
        `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
        { per_page: "100" },
        signal,
      ),
    ]);

    // Also fetch PR metadata for context
    const pr = await this.get<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`,
      undefined,
      signal,
    );

    let markdown = `# PR #${pr.number} Reviews: ${pr.title}\n\n`;
    markdown += `**Branch:** \`${pr.head.ref}\` -> \`${pr.base.ref}\`\n`;
    markdown += `**URL:** ${pr.html_url}\n\n`;

    // Reviews summary
    if (reviews.length > 0) {
      markdown += `## Reviews (${reviews.length})\n\n`;
      for (const review of reviews) {
        const stateIcon =
          review.state === "APPROVED"
            ? "[APPROVED]"
            : review.state === "CHANGES_REQUESTED"
              ? "[CHANGES REQUESTED]"
              : review.state === "COMMENTED"
                ? "[COMMENTED]"
                : review.state === "DISMISSED"
                  ? "[DISMISSED]"
                  : "[PENDING]";
        markdown += `### @${review.user.login} ${stateIcon}\n\n`;
        markdown += `**Submitted:** ${review.submitted_at}\n\n`;
        if (review.body) {
          markdown += `${review.body}\n\n`;
        }
        markdown += `---\n\n`;
      }
    } else {
      markdown += `## Reviews\n\n_No reviews yet._\n\n`;
    }

    // Inline review comments
    if (reviewComments.length > 0) {
      // Group by file
      const byFile = new Map<string, GitHubReviewComment[]>();
      for (const comment of reviewComments) {
        const existing = byFile.get(comment.path) ?? [];
        existing.push(comment);
        byFile.set(comment.path, existing);
      }

      markdown += `## Inline Comments (${reviewComments.length})\n\n`;

      for (const [filePath, comments] of byFile) {
        markdown += `### ${filePath}\n\n`;
        for (const comment of comments) {
          const line = comment.line ?? comment.original_line;
          const lineInfo = line ? ` (line ${line})` : "";
          const replyInfo = comment.in_reply_to_id ? " (reply)" : "";
          markdown += `#### @${comment.user.login}${lineInfo}${replyInfo} - ${comment.created_at}\n\n`;
          if (comment.diff_hunk) {
            markdown += `\`\`\`diff\n${comment.diff_hunk}\n\`\`\`\n\n`;
          }
          markdown += `${comment.body}\n\n`;
          markdown += `---\n\n`;
        }
      }
    } else {
      markdown += `## Inline Comments\n\n_No inline comments._\n\n`;
    }

    return markdown;
  }

  /** Compare two branches/refs */
  async compareRefs(
    owner: string,
    repo: string,
    base: string,
    head: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const data = await this.get<GitHubCompareResponse>(
      `/repos/${owner}/${repo}/compare/${base}...${head}`,
      undefined,
      signal,
    );

    let markdown = `# Compare: ${base}...${head}\n\n`;
    markdown += `**Repository:** ${owner}/${repo}\n`;
    markdown += `**Status:** ${data.status}\n`;
    markdown += `**Ahead by:** ${data.ahead_by} commits\n`;
    markdown += `**Behind by:** ${data.behind_by} commits\n`;
    markdown += `**Total commits:** ${data.total_commits}\n`;
    markdown += `**Files changed:** ${data.files.length}\n\n`;

    // Commits
    if (data.commits.length > 0) {
      markdown += `## Commits (${data.commits.length})\n\n`;
      for (const commit of data.commits) {
        const shortSha = commit.sha.substring(0, 7);
        const message = commit.commit.message.split("\n")[0];
        const date = commit.commit.author.date.split("T")[0];
        const author = commit.author?.login || commit.commit.author.name;
        markdown += `- **${shortSha}** (${date}) - ${author}: ${message}\n`;
      }
      markdown += `\n`;
    }

    // Files changed
    if (data.files.length > 0) {
      markdown += `## Files Changed (${data.files.length})\n\n`;
      for (const file of data.files) {
        const statusIcon =
          file.status === "added"
            ? "[+]"
            : file.status === "removed"
              ? "[-]"
              : file.status === "renamed"
                ? "[R]"
                : "[M]";

        markdown += `### ${statusIcon} ${file.filename}\n\n`;

        if (file.previous_filename) {
          markdown += `_Renamed from: ${file.previous_filename}_\n\n`;
        }

        markdown += `**Status:** ${file.status} (+${file.additions} -${file.deletions})\n\n`;

        if (file.patch) {
          markdown += `\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
        }
      }
    }

    return markdown;
  }

  /** Get diff for a specific commit */
  async getCommitDiff(
    owner: string,
    repo: string,
    sha: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const commit = await this.get<GitHubCommitDetail>(
      `/repos/${owner}/${repo}/commits/${sha}`,
      undefined,
      signal,
    );

    const shortSha = commit.sha.substring(0, 7);
    const message = commit.commit.message;
    const date = commit.commit.author.date;
    const author = commit.author?.login || commit.commit.author.name;

    let markdown = `# Commit ${shortSha}\n\n`;
    markdown += `**SHA:** ${commit.sha}\n`;
    markdown += `**Author:** ${author}\n`;
    markdown += `**Date:** ${date}\n`;
    markdown += `**URL:** ${commit.html_url}\n\n`;

    markdown += `## Message\n\n`;
    markdown += `${message}\n\n`;

    markdown += `## Stats\n\n`;
    markdown += `- **Additions:** +${commit.stats.additions}\n`;
    markdown += `- **Deletions:** -${commit.stats.deletions}\n`;
    markdown += `- **Total Changes:** ${commit.stats.total}\n`;
    markdown += `- **Files Changed:** ${commit.files.length}\n\n`;

    markdown += `## Files Changed\n\n`;

    for (const file of commit.files) {
      const statusIcon =
        file.status === "added"
          ? "➕"
          : file.status === "removed"
            ? "➖"
            : file.status === "renamed"
              ? "📝"
              : "📄";

      markdown += `### ${statusIcon} ${file.filename}\n\n`;

      if (file.previous_filename) {
        markdown += `_Renamed from: ${file.previous_filename}_\n\n`;
      }

      markdown += `**Status:** ${file.status} (+${file.additions} -${file.deletions})\n\n`;

      if (file.patch) {
        markdown += `\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
      }
    }

    return markdown;
  }
}

/** Create a GitHub client (throws if GITHUB_TOKEN not set) */
export function createGitHubClient(): GitHubClient {
  return new GitHubClient();
}

/** Parse GitHub URL to extract owner, repo, and path info */
export function parseGitHubUrl(url: string): ParsedGitHubUrl {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") {
    throw new Error(`Not a GitHub URL: ${url}`);
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  // Just owner/repo
  if (parts.length === 2) {
    return { owner, repo, type: "repo" };
  }

  const part2 = parts[2];
  const part3 = parts[3];

  // Issues: owner/repo/issues/123
  if (part2 === "issues" && parts.length >= 4 && part3) {
    const number = parseInt(part3, 10);
    if (Number.isNaN(number)) {
      throw new Error(`Invalid issue number: ${part3}`);
    }
    return { owner, repo, type: "issue", number };
  }

  // Pull requests: owner/repo/pull/123
  if (part2 === "pull" && parts.length >= 4 && part3) {
    const number = parseInt(part3, 10);
    if (Number.isNaN(number)) {
      throw new Error(`Invalid PR number: ${part3}`);
    }
    return { owner, repo, type: "pull", number };
  }

  // owner/repo/blob/ref/path (file)
  if (part2 === "blob" && parts.length >= 4 && part3) {
    const ref = part3;
    const path = parts.slice(4).join("/");
    return { owner, repo, type: "file", path, ref };
  }

  // owner/repo/tree/ref/path (directory or tree)
  if (part2 === "tree" && parts.length >= 4 && part3) {
    const ref = part3;
    const path = parts.slice(4).join("/") || undefined;
    return { owner, repo, type: path ? "directory" : "tree", path, ref };
  }

  // Fallback: treat as repo
  return { owner, repo, type: "repo" };
}
