/**
 * Find Sessions tool - search past Pi sessions by keyword with optional filters.
 *
 * Uses ripgrep-based search for efficient scanning across session files.
 */

import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  type SearchBackend,
  type SearchOptions,
  type SessionSearchResult,
  searchSessions,
} from "../lib/session-search";

const FindSessionsParams = Type.Object({
  query: Type.String({
    description: "Keyword to search for in sessions",
  }),
  cwd: Type.Optional(
    Type.String({
      description: "Filter to sessions from this working directory",
    }),
  ),
  after: Type.Optional(
    Type.String({
      description:
        "Filter to sessions modified after this date (ISO or relative: '7d', '2w', '1m')",
    }),
  ),
  before: Type.Optional(
    Type.String({
      description:
        "Filter to sessions modified before this date (ISO or relative: '7d', '2w', '1m')",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      description: "Maximum number of sessions to return (default: 10)",
      minimum: 1,
      maximum: 100,
    }),
  ),
});

type FindSessionsParamsType = {
  query: string;
  cwd?: string;
  after?: string;
  before?: string;
  limit?: number;
};

interface FindSessionsDetails {
  query: string;
  backend: SearchBackend;
  filters: {
    cwd?: string;
    after?: string;
    before?: string;
    limit?: number;
  };
  resultCount: number;
  results: SessionSearchResult[];
}

type ExecuteResult = AgentToolResult<FindSessionsDetails>;

function renderSessionCard(
  session: SessionSearchResult,
  query: string,
  theme: Theme,
): string[] {
  const date = (session.created || session.modified || "").slice(0, 10);
  const title = session.name || "(untitled)";
  const firstMessage = session.firstMessage || "(no messages yet)";
  const msgCount = `${session.messageCount} msg${session.messageCount === 1 ? "" : "s"}`;
  const snippet = session.matchedSnippet?.replace(/\s+/g, " ").trim();
  const lines: string[] = [];

  lines.push(
    `${theme.fg("muted", "┌─")} ${theme.fg("accent", session.id.slice(0, 8))} ${theme.fg("muted", "•")} ${theme.fg("muted", date)} ${theme.fg("muted", "•")} ${theme.fg("toolOutput", title)} ${theme.fg("muted", "•")} ${theme.fg("success", msgCount)}`,
  );
  lines.push(
    `${theme.fg("muted", "│")} ${theme.fg("muted", "term:")} ${theme.fg("accent", `"${query}"`)}`,
  );

  if (typeof session.score === "number") {
    lines.push(
      `${theme.fg("muted", "│")} ${theme.fg("muted", "score:")} ${theme.fg("success", session.score.toFixed(3))}`,
    );
  }

  lines.push(
    `${theme.fg("muted", "│")} ${theme.fg("muted", "first:")} ${theme.fg("toolOutput", firstMessage)}`,
  );

  if (snippet) {
    lines.push(
      `${theme.fg("muted", "│")} ${theme.fg("muted", "match:")} ${theme.fg("toolOutput", snippet)}`,
    );
  }

  lines.push(theme.fg("muted", "└─"));
  return lines;
}

export const FIND_SESSIONS_GUIDANCE = `
## find_sessions

Use find_sessions when the user explicitly asks to find or search for a previous session or conversation.

**When to use:**
- User asks to find a past conversation ("find the session where we discussed X")
- User wants to locate sessions by topic, date, or project

**When NOT to use:**
- Questions about the current session
- General codebase search (use lookout/grep)
`;

/**
 * Setup the find_sessions tool for discovering sessions by keyword.
 */
export function setupFindSessionsTool(pi: ExtensionAPI) {
  pi.registerTool<typeof FindSessionsParams, FindSessionsDetails>({
    name: "find_sessions",
    label: "Find Sessions",
    description: `Search through past Pi coding sessions by keyword or phrase.

WHEN TO USE:
- Locate previous sessions by topic ("database", "auth", "bug fix")
- Find sessions from a specific project directory
- Search sessions within a date range
- Retrieve recent work to continue from

RESULTS: Returns matching sessions with metadata including name, directory, date, and matched snippet.
Uses Sesame indexed search when available, with ripgrep fallback.`,

    parameters: FindSessionsParams,

    async execute(
      _toolCallId: string,
      params: FindSessionsParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      const { query, cwd, after, before, limit } = params;

      // Get current session ID to filter it out
      const currentSessionId = ctx.sessionManager.getSessionId();

      // Build search options
      const searchOpts: SearchOptions = {
        query,
        cwd,
        after,
        before,
        limit: limit || 10,
      };

      // Execute search
      let backend: SearchBackend = "ripgrep";
      let results: SessionSearchResult[] = [];
      try {
        const response = await searchSessions(searchOpts);
        backend = response.backend;
        results = response.results;
        // Filter out current session - users searching for sessions want to find other sessions, not the one they're in
        results = results.filter((r) => r.id !== currentSessionId);
      } catch (err) {
        console.error("[find-sessions] Search error:", err);
        // Return empty results rather than failing
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query,
                backend,
                resultCount: 0,
                results: [],
                error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
              }),
            },
          ],
          details: {
            query,
            backend,
            filters: { cwd, after, before, limit },
            resultCount: 0,
            results: [],
          },
        };
      }

      // Format result for LLM
      const resultJson = JSON.stringify({
        query,
        backend,
        resultCount: results.length,
        results: results.map((r) => ({
          id: r.id,
          path: r.path,
          cwd: r.cwd,
          name: r.name,
          created: r.created,
          modified: r.modified,
          messageCount: r.messageCount,
          firstMessage: r.firstMessage,
          matchedSnippet: r.matchedSnippet,
          score: r.score,
        })),
      });

      return {
        content: [{ type: "text", text: resultJson }],
        details: {
          query,
          backend,
          filters: { cwd, after, before, limit: limit || 10 },
          resultCount: results.length,
          results,
        },
      };
    },

    renderCall(args: FindSessionsParamsType, theme: Theme) {
      const query = args.query.trim();
      const shortQuery = query.length > 70 ? `${query.slice(0, 67)}...` : query;

      return new ToolCallHeader(
        {
          toolName: "Find Sessions",
          mainArg: `"${shortQuery}"`,
          optionArgs: [
            { label: "limit", value: String(args.limit ?? 10), tone: "accent" },
            ...(args.cwd ? [{ label: "cwd", value: args.cwd }] : []),
            ...(args.after ? [{ label: "after", value: args.after }] : []),
            ...(args.before ? [{ label: "before", value: args.before }] : []),
          ],
          longArgs:
            query.length > 70
              ? [
                  {
                    label: "query",
                    value: query,
                  },
                ]
              : [],
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<FindSessionsDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;

      if (!details) {
        const text = result.content[0];
        const content = text?.type === "text" ? text.text : "No result";
        return new Text(content, 0, 0);
      }

      const { query, backend, resultCount, results, filters } = details;
      const fields: Array<
        { label: string; value: string; showCollapsed?: boolean } | Text
      > = [];

      if (resultCount === 0) {
        fields.push(
          new Text(
            `${theme.fg("muted", "No sessions found matching")} ${theme.fg("accent", `"${query}"`)}`,
            0,
            0,
          ),
        );
      } else {
        const lines: string[] = [];

        if (!options.expanded) {
          for (const session of results) {
            const date = (session.created || session.modified || "").slice(
              0,
              10,
            );
            const label = session.name || session.firstMessage || "(untitled)";
            const preview =
              label.length > 48 ? `${label.slice(0, 48)}...` : label;
            const msgCount = `${session.messageCount} msg${session.messageCount === 1 ? "" : "s"}`;

            lines.push(
              `  ${theme.fg("success", "•")} ${theme.fg("accent", session.id.slice(0, 8))} ${theme.fg("muted", "- ")}${theme.fg("muted", date)} ${theme.fg("muted", "- ")}${theme.fg("toolOutput", preview)} ${theme.fg("muted", "- ")}${theme.fg("success", msgCount)}`,
            );
          }
        } else {
          for (const session of results) {
            if (lines.length > 0) lines.push("");
            lines.push(...renderSessionCard(session, query, theme));
          }
        }

        if (lines.length > 0) {
          fields.push(new Text(lines.join("\n"), 0, 0));
        }
      }

      const footer = new ToolFooter(theme, {
        items: [
          {
            label: "backend",
            value: backend === "sesame" ? "sesame" : "ripgrep",
            tone: "accent",
          },
          { label: "matches", value: String(resultCount), tone: "success" },
          {
            label: "limit",
            value: String(filters.limit ?? 10),
            tone: "muted",
          },
        ],
      });

      return new ToolBody(
        {
          fields,
          footer,
        },
        options,
        theme,
      );
    },
  });
}
