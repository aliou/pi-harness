/**
 * List Sessions tool - list sessions for a given directory.
 *
 * Queries the Sesame DB for session metadata instead of reading files.
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
import type { SessionResult } from "@harness/session-store";
import { listSessions } from "@harness/session-store";
import { Type } from "typebox";

const ListSessionsParams = Type.Object({
  cwd: Type.String({
    description: "Directory to list sessions for",
  }),
  limit: Type.Optional(
    Type.Integer({
      description: "Maximum number of sessions to return (default: 20)",
      minimum: 1,
      maximum: 100,
    }),
  ),
  depth: Type.Optional(
    Type.Integer({
      description:
        "How many levels of child directories to include (default: 0, exact match only)",
      minimum: 0,
      maximum: 5,
    }),
  ),
});

interface ListSessionsDetails {
  cwd: string;
  limit: number;
  depth: number;
  resultCount: number;
  results: SessionResult[];
}

type ExecuteResult = AgentToolResult<ListSessionsDetails>;

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

export const LIST_SESSIONS_GUIDANCE = `
## list_sessions

Use list_sessions to browse recent sessions for a specific directory. Results are ordered by modification time, newest first.

**When to use:**
- User wants to see what sessions exist for a project directory
- User wants to browse recent sessions for a directory without a keyword search
- User wants to see sessions from child directories of a project

**When NOT to use:**
- User wants to search by keyword (use find_sessions)
- User wants to read a specific session (use read_session)

**How to use results:**
- Use depth: 0 for the exact directory; increase depth only when child projects are relevant.
- Select a session id, then use read_session with a narrow extraction goal before answering questions about its content.
`;

/**
 * Setup the list_sessions tool for browsing sessions by directory.
 */
export const listSessionsTool = defineTool({
  name: "list_sessions",
  label: "List Sessions",
  description: `Browse recent Pi coding sessions for a directory.

WHEN TO USE:
- Browse recent sessions for a project directory
- See what sessions exist without a keyword search
- Include child directories only when needed with depth

RESULTS: Returns sessions sorted by modification date (newest first), including names, message counts, and dates. Use read_session to inspect a selected session.`,
  promptSnippet:
    "Browse recent sessions for an exact directory or limited child-directory depth, sorted by modification time.",
  promptGuidelines: [
    "list_sessions: Use to browse recent sessions for a specific directory without keyword search.",
    "list_sessions: Use depth > 0 only when child directories are relevant; depth 0 is an exact directory match.",
    "list_sessions: Use read_session after selecting a session; do not infer session content from list metadata.",
    "list_sessions: Do not use for keyword search; use find_sessions instead.",
  ],

  parameters: ListSessionsParams,

  async execute(
    _toolCallId,
    params,
    signal,
    _onUpdate,
    _ctx,
  ): Promise<ExecuteResult> {
    const { cwd, limit = 20, depth = 0 } = params;

    let results: SessionResult[] = [];
    try {
      results = await listSessions({ cwd, limit, depth }, signal);
    } catch (err) {
      console.error("[list-sessions] Error:", err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              cwd,
              resultCount: 0,
              results: [],
              error: `List failed: ${err instanceof Error ? err.message : String(err)}`,
            }),
          },
        ],
        details: {
          cwd,
          limit,
          depth,
          resultCount: 0,
          results: [],
        },
      };
    }

    const resultJson = JSON.stringify({
      cwd,
      resultCount: results.length,
      results: results.map((r) => ({
        id: r.id,
        path: r.path,
        cwd: r.cwd,
        name: r.name,
        created: r.created,
        modified: r.modified,
        messageCount: r.messageCount,
        matchMode: r.matchMode,
        matchedType: r.matchedType,
        matchedEntryId: r.matchedEntryId,
        matchedAt: r.matchedAt,
      })),
    });

    return {
      content: [{ type: "text", text: resultJson }],
      details: {
        cwd,
        limit,
        depth,
        resultCount: results.length,
        results,
      },
    };
  },

  renderCall(args, theme) {
    return new ToolCallHeader(
      {
        toolName: "List Sessions",
        mainArg: args.cwd,
        optionArgs: [
          {
            label: "limit",
            value: String(args.limit ?? 20),
            tone: "accent",
          },
          ...(args.depth
            ? [
                {
                  label: "depth",
                  value: String(args.depth),
                  tone: "accent" as const,
                },
              ]
            : []),
        ],
      },
      theme,
    );
  },

  renderResult(
    result: AgentToolResult<ListSessionsDetails>,
    options: ToolRenderResultOptions,
    theme: Theme,
    context,
  ) {
    if (options.isPartial) {
      return renderLoadingResult("loading...", theme, context);
    }

    stopLoadingResult(context.lastComponent);

    const { details } = result;

    if (!details) {
      const text = result.content[0];
      const content = text?.type === "text" ? text.text : "No result";
      return new Text(content, 0, 0);
    }

    const { cwd, resultCount, results, limit, depth } = details;
    const fields: Array<
      { label: string; value: string; showCollapsed?: boolean } | Text
    > = [];

    if (resultCount === 0) {
      fields.push(
        new Text(
          `${theme.fg("muted", "No sessions found for")} ${theme.fg("accent", cwd)}`,
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
          const date = (session.modified || session.created || "").slice(0, 10);
          const title = session.name || "(untitled)";
          const msgCount = `${session.messageCount} msg${session.messageCount === 1 ? "" : "s"}`;

          if (lines.length > 0) lines.push("");
          lines.push(
            `${theme.fg("muted", "┌─")} ${theme.fg("accent", session.id.slice(0, 8))} ${theme.fg("muted", "•")} ${theme.fg("muted", date)} ${theme.fg("muted", "•")} ${theme.fg("toolOutput", title)} ${theme.fg("muted", "•")} ${theme.fg("success", msgCount)}`,
          );
          if (session.cwd !== cwd) {
            lines.push(
              `${theme.fg("muted", "│")} ${theme.fg("muted", "dir:")} ${theme.fg("accent", session.cwd)}`,
            );
          }
          lines.push(theme.fg("muted", "└─"));
        }
      }

      if (lines.length > 0) {
        fields.push(new Text(lines.join("\n"), 0, 0));
      }
    }

    const footerItems: Array<{
      label: string;
      value: string;
      tone?: "muted" | "accent" | "success" | "warning" | "error";
    }> = [
      { label: "sessions", value: String(resultCount), tone: "success" },
      { label: "limit", value: String(limit), tone: "muted" },
    ];
    if (depth > 0) {
      footerItems.push({
        label: "depth",
        value: String(depth),
        tone: "accent" as const,
      });
    }

    const footer = new ToolFooter(theme, { items: footerItems });

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
  pi.registerTool(listSessionsTool);
}
