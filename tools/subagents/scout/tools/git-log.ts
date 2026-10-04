import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execGit } from "./git-exec";

const Params = Type.Object({
  repoPath: Type.Optional(
    Type.String({
      description:
        "Absolute path to the local repository. Defaults to the current working directory.",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description:
        "Text to search in commit messages (maps to --grep). Case-insensitive by default.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description:
        "Filter commits to those that changed files under this path (appended after --).",
    }),
  ),
  since: Type.Optional(
    Type.String({
      description:
        'Only commits after this date (ISO 8601 or relative, e.g. "2025-01-01" or "2.weeks").',
    }),
  ),
  until: Type.Optional(
    Type.String({
      description:
        'Only commits before this date (ISO 8601 or relative, e.g. "2025-06-01" or "yesterday").',
    }),
  ),
  author: Type.Optional(
    Type.String({
      description: "Filter by author name or email.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of commits to return. Default 50.",
      minimum: 1,
      maximum: 200,
    }),
  ),
  skip: Type.Optional(
    Type.Number({
      description: "Number of commits to skip (for pagination).",
      minimum: 0,
    }),
  ),
});

function textResult(text: string, details?: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

export function createScoutGitLogTool(
  pi: ExtensionAPI,
  cwd: string,
): ToolDefinition<typeof Params> {
  return {
    name: "git_log",
    label: "Git Log",
    description: `Search git commit history in a local repository.

Returns a tab-separated table: short sha, date, author, subject.`,
    promptSnippet:
      "Search local git commit history (sha, date, author, subject)",
    promptGuidelines: [
      "Use git_log when commit history, evolution, regressions, or old implementations matter.",
      "Prefer query/path filters over broad scans; use limit to bound results.",
    ],
    parameters: Params,
    async execute(_id, params, signal) {
      const limit = params.limit ?? 50;
      const skip = params.skip ?? 0;
      const repoPath = params.repoPath ?? cwd;

      const args = [
        "log",
        "--date=iso",
        "--pretty=format:%h%x09%ad%x09%an%x09%s",
        "-n",
        String(limit),
      ];

      if (skip > 0) args.push("--skip", String(skip));
      if (params.query) args.push("--grep", params.query, "-i");
      if (params.author) args.push("--author", params.author);
      if (params.since) args.push("--since", params.since);
      if (params.until) args.push("--until", params.until);
      if (params.path) args.push("--", params.path);

      const result = await execGit(pi, args, repoPath, signal);

      if (result.code !== 0) {
        const msg = result.stderr.trim() || result.stdout.trim();
        throw new Error(`git log failed: ${msg}`);
      }

      const output = result.stdout.trimEnd();
      if (!output)
        return textResult("No commits found.", { commits: [], count: 0 });

      const lines = output.split("\n");
      const commits = lines.map((line) => {
        const [sha, date, author, ...subjectParts] = line.split("\t");
        return {
          sha: sha ?? "",
          date: date ?? "",
          author: author ?? "",
          subject: subjectParts.join("\t") ?? "",
        };
      });

      return textResult(output, { commits, count: commits.length, repoPath });
    },
  };
}
