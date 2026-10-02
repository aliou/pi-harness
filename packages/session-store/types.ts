/** Session metadata returned by search and list operations. */
export interface SessionResult {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  matchedSnippet?: string;
  score?: number;
  matchMode: "all" | "any" | "browse";
  matchedType: string | null;
  matchedEntryId: string | null;
  matchedAt: string | null;
}

/** Lightweight session reference (autocomplete, context injection). */
export interface SessionRef {
  id: string;
  name: string;
  cwd: string;
  created: string;
  modified: string;
}

/** Options for searchSessions. */
export interface SearchOptions {
  query?: string;
  cwd?: string;
  after?: string;
  before?: string;
  limit?: number;
  /** Only sessions with tool calls that ran nested inside this tool (e.g. "codemode"). */
  via?: string;
}

/** Options for listSessions. */
export interface ListOptions {
  cwd: string;
  limit?: number;
  depth?: number;
}
