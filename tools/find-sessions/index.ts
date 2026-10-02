/**
 * Find Sessions tool - search past Pi sessions by keyword with optional filters.
 *
 * Uses Sesame indexed search for fast BM25-based session discovery.
 */

import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Component, Loader, Text, type TUI } from "@earendil-works/pi-tui";
import type { SearchOptions, SessionResult } from "@harness/session-store";
import { searchSessions } from "@harness/session-store";
import { Type } from "typebox";
import { buildFindSessionsOutput } from "./helpers";
import { FindSessionsOutputSchema } from "./types";

const FindSessionsParams = Type.Object({
  query: Type.Optional(
    Type.String({
      description:
        "Keyword to search for in sessions. Omit to browse recent sessions.",
    }),
  ),
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
  via: Type.Optional(
    Type.String({
      description:
        "Only sessions with tool calls that ran nested inside this tool (e.g. 'codemode' for pi codemode scripts)",
    }),
  ),
});

interface FindSessionsDetails {
  query?: string;
  filters: {
    cwd?: string;
    after?: string;
    before?: string;
    limit?: number;
    via?: string;
  };
  resultCount: number;
  results: SessionResult[];
}

type ExecuteResult = AgentToolResult<FindSessionsDetails>;

type LoadingRenderContext = {
  invalidate: () => void;
  lastComponent?: Component;
};

const loaderMessages = new WeakMap<Loader, string>();

function createLoaderTui(context: LoadingRenderContext): TUI {
  let queued = false;

  return {
    requestRender: () => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        context.invalidate();
      }, 0);
    },
  } as unknown as TUI;
}

function renderLoadingResult(
  message: string,
  theme: Theme,
  context: LoadingRenderContext,
): Loader {
  if (context.lastComponent instanceof Loader) {
    if (loaderMessages.get(context.lastComponent) !== message) {
      context.lastComponent.setMessage(message);
      loaderMessages.set(context.lastComponent, message);
    }
    return context.lastComponent;
  }

  const loader = new Loader(
    createLoaderTui(context),
    (text) => theme.fg("accent", text),
    (text) => theme.fg("muted", text),
    message,
  );
  loaderMessages.set(loader, message);
  return loader;
}

function stopLoadingResult(component: Component | undefined): void {
  if (component instanceof Loader) component.stop();
}

function renderSessionCard(
  session: SessionResult,
  query: string | undefined,
  theme: Theme,
): string[] {
  const date = (session.modified || session.created || "").slice(0, 10);
  const title = session.name || "(untitled)";
  const msgCount = `${session.messageCount} msg${session.messageCount === 1 ? "" : "s"}`;
  const snippet = session.matchedSnippet?.replace(/\s+/g, " ").trim();
  const lines: string[] = [];

  lines.push(
    `${theme.fg("muted", "┌─")} ${theme.fg("accent", session.id.slice(0, 8))} ${theme.fg("muted", "•")} ${theme.fg("muted", date)} ${theme.fg("muted", "•")} ${theme.fg("toolOutput", title)} ${theme.fg("muted", "•")} ${theme.fg("success", msgCount)}`,
  );
  if (query) {
    lines.push(
      `${theme.fg("muted", "│")} ${theme.fg("muted", "term:")} ${theme.fg("accent", `"${query}"`)}`,
    );
  }

  lines.push(
    `${theme.fg("muted", "│")} ${theme.fg("muted", "mode:")} ${theme.fg("accent", session.matchMode)}`,
  );

  if (session.matchedType) {
    lines.push(
      `${theme.fg("muted", "│")} ${theme.fg("muted", "type:")} ${theme.fg("toolOutput", session.matchedType)}`,
    );
  }

  if (typeof session.score === "number") {
    lines.push(
      `${theme.fg("muted", "│")} ${theme.fg("muted", "score:")} ${theme.fg("success", session.score.toFixed(3))}`,
    );
  }

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

Use find_sessions to discover past sessions by topic, date, project, or recent activity. It searches indexed session text, titles, and active checkpoints.

**When to use:**
- User asks to find a past conversation ("find the session where we discussed X")
- User wants to locate work by topic, date, project, title, or checkpoint
- User wants recent sessions and does not need directory-depth filtering; omit the query to browse by most recently modified

**When NOT to use:**
- Questions about the current session
- General codebase search (use lookout/grep)

**How to use results:**
- Use a focused query when the user supplies a topic. Sesame tries all terms first and broadens only when needed; check the reported matchMode.
- Match provenance identifies whether text, a tool call, a session title, or a checkpoint matched. Pass the selected id to read_session with a narrow extraction goal.
- Search results are discovery metadata, not the session evidence. Use read_session before making claims about a past session.
`;

/**
 * Setup the find_sessions tool for discovering sessions by keyword.
 */
export const findSessionsTool = defineTool({
  name: "find_sessions",
  label: "Find Sessions",
  description: `Search or browse past Pi coding sessions.

WHEN TO USE:
- Locate previous sessions by topic, title, or checkpoint ("database", "auth", "bug fix")
- Find sessions from a specific project directory or modification-date range
- Omit query to browse recent sessions, optionally narrowed by directory or date

RESULTS: Returns session metadata plus the best matching snippet and provenance. Match provenance can identify message text, tool calls, titles, or checkpoints. Use read_session to inspect a selected session; do not treat search snippets as complete evidence.
Uses Sesame indexed search.`,
  promptSnippet:
    "Search or browse past sessions by topic, title, checkpoint, date, or project; returns match provenance.",
  promptGuidelines: [
    "find_sessions: Use when the user asks to find, search, or browse previous sessions by topic, title, checkpoint, date, project, or recent activity.",
    "find_sessions: Omit query to browse recent sessions; provide a focused query for a known topic.",
    "find_sessions: Inspect matchMode and provenance to understand why a session matched, then use read_session for evidence.",
    "find_sessions: Do not use for the current session or general codebase search.",
  ],

  parameters: FindSessionsParams,
  outputSchema: FindSessionsOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },

  async execute(
    _toolCallId,
    params,
    signal,
    _onUpdate,
    ctx,
  ): Promise<ExecuteResult> {
    const { cwd, after, before, limit, via } = params;
    const query = params.query?.trim() || undefined;

    // Get current session ID to filter it out
    const currentSessionId = ctx.sessionManager.getSessionId();

    // Build search options
    const searchOpts: SearchOptions = {
      query,
      cwd,
      after,
      before,
      limit: limit || 10,
      via,
    };

    // Execute search
    let results: SessionResult[] = [];
    try {
      results = await searchSessions(searchOpts, signal);
      // Filter out current session - users searching for sessions want to find other sessions, not the one they're in
      results = results.filter((r) => r.id !== currentSessionId);
    } catch (err) {
      console.error("[find-sessions] Search error:", err);
      const output = buildFindSessionsOutput(
        query,
        [],
        `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        details: {
          query,
          filters: { cwd, after, before, limit },
          resultCount: 0,
          results: [],
        },
        structuredContent: output,
        isError: true,
      };
    }

    const output = buildFindSessionsOutput(query, results);

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
      details: {
        query,
        filters: { cwd, after, before, limit: limit || 10, via },
        resultCount: results.length,
        results,
      },
    };
  },

  renderCall(args, theme) {
    const query = args.query?.trim();
    const isBrowse = !query;
    const displayQuery = query ?? "recent sessions";
    const shortQuery =
      query && query.length > 70 ? `${query.slice(0, 67)}...` : query;

    return new ToolCallHeader(
      {
        toolName: "Find Sessions",
        mainArg: isBrowse ? displayQuery : `"${shortQuery}"`,
        optionArgs: [
          { label: "limit", value: String(args.limit ?? 10), tone: "accent" },
          ...(args.cwd ? [{ label: "cwd", value: args.cwd }] : []),
          ...(args.after ? [{ label: "after", value: args.after }] : []),
          ...(args.before ? [{ label: "before", value: args.before }] : []),
          ...(args.via ? [{ label: "via", value: args.via }] : []),
        ],
        longArgs:
          query && query.length > 70
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
    context,
  ) {
    if (options.isPartial) {
      return renderLoadingResult("searching...", theme, context);
    }

    stopLoadingResult(context.lastComponent);

    const { details } = result;

    if (!details) {
      const text = result.content[0];
      const content = text?.type === "text" ? text.text : "No result";
      return new Text(content, 0, 0);
    }

    const { query, resultCount, results, filters } = details;
    const fields: Array<
      { label: string; value: string; showCollapsed?: boolean } | Text
    > = [];

    if (resultCount === 0) {
      fields.push(
        new Text(
          query
            ? `${theme.fg("muted", "No sessions found matching")} ${theme.fg("accent", `"${query}"`)}`
            : theme.fg("muted", "No recent sessions found"),
          0,
          0,
        ),
      );
    } else {
      const lines: string[] = [];

      if (!options.expanded) {
        for (const session of results) {
          const date = (session.modified || session.created || "").slice(0, 10);
          const label = session.name || "(untitled)";
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

export default async function (pi: ExtensionAPI) {
  pi.registerTool(findSessionsTool);
}
