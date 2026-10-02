/** Adapt Sesame's async session search for Pi tools and autocomplete. */

import { resolve } from "node:path";
import {
  type IndexedSessionRow,
  parseRelativeDate,
  type SearchOptions as SesameSearchOptions,
  type SearchResult as SesameSearchResult,
} from "@aliou/sesame";
import { getSearchClient } from "./db";
import type {
  ListOptions,
  SearchOptions,
  SessionRef,
  SessionResult,
} from "./types";

/** Map our SearchOptions to sesame's SearchOptions. */
function toSesameOptions(options: SearchOptions): SesameSearchOptions {
  const { cwd, after, before, limit, via } = options;

  return {
    cwd,
    after: toSesameDate(after),
    before: toSesameDate(before),
    limit,
    via,
  };
}

/** Convert date filter to sesame library format (ISO date string). */
function toSesameDate(input?: string): string | undefined {
  if (!input) return undefined;

  // Preserve ISO-like input to match previous behavior
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    return input;
  }

  const parsed = parseRelativeDate(input);
  if (!parsed) return undefined;
  return parsed.length >= 10 ? parsed.slice(0, 10) : parsed;
}

/** Resolve a Sesame result to the tool's session shape. */
function toSessionResult(
  r: SesameSearchResult & { messageCount: number },
): SessionResult {
  return {
    id: r.sessionId,
    path: r.path,
    cwd: r.cwd ?? "",
    name: r.name ?? undefined,
    created: r.createdAt ?? r.modifiedAt ?? "",
    modified: r.modifiedAt ?? r.createdAt ?? "",
    messageCount: r.messageCount,
    matchedSnippet: r.matchedSnippet || undefined,
    score: r.score || undefined,
    matchMode: r.matchMode,
    matchedType: r.matchedType,
    matchedEntryId: r.matchedEntryId,
    matchedAt: r.matchedAt,
  };
}

/**
 * Search sessions using the Sesame indexed search library.
 * Respects cwd and date filters, returns sorted results up to limit.
 */
export async function searchSessions(
  options: SearchOptions,
  signal?: AbortSignal,
): Promise<SessionResult[]> {
  const { query } = options;
  const sesameOptions = toSesameOptions(options);
  const rawResults = await getSearchClient().search(
    query,
    sesameOptions,
    signal,
  );
  return rawResults.map(toSessionResult);
}

/**
 * List sessions for a given directory (or child directories up to depth).
 *
 * Queries the sesame DB instead of reading the filesystem.
 * The DB is the source of truth.
 */
export async function listSessions(
  options: ListOptions,
  signal?: AbortSignal,
): Promise<SessionResult[]> {
  const { cwd, limit = 20, depth = 0 } = options;
  const rows = await getSearchClient().list(resolve(cwd), limit, depth, signal);
  return rows.map((row) => toBrowseResult(row));
}

function toBrowseResult(row: IndexedSessionRow): SessionResult {
  return {
    id: row.id,
    path: row.path,
    cwd: row.cwd || "",
    name: row.name ?? undefined,
    created: row.created_at ?? row.modified_at ?? "",
    modified: row.modified_at ?? row.created_at ?? "",
    messageCount: row.message_count ?? 0,
    matchedSnippet: undefined,
    score: undefined,
    matchMode: "browse",
    matchedType: null,
    matchedEntryId: null,
    matchedAt: null,
  };
}

/**
 * Resolve a session UUID to a SessionRef using the DB directly.
 * Returns null if the session is not found.
 */
export async function resolveSessionRef(
  sessionId: string,
): Promise<SessionRef | null> {
  try {
    const row = await getSearchClient().get(sessionId);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name || "(untitled)",
      cwd: row.cwd || "",
      created: row.created_at || "",
      modified: row.modified_at || "",
    };
  } catch (_error) {
    void _error;
    return null;
  }
}

/**
 * Search sessions by name using SQL LIKE. Fast alternative to FTS for
 * short tokens (avoids expensive FTS matches for single characters).
 */
export async function searchSessionsByName(
  token: string,
  cwd?: string,
): Promise<SessionResult[]> {
  const rows = await getSearchClient().searchNames(token, cwd);

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    cwd: row.cwd || "",
    name: row.name ?? undefined,
    created: row.created_at ?? row.modified_at ?? "",
    modified: row.modified_at ?? row.created_at ?? "",
    messageCount: row.message_count ?? 0,
    matchedSnippet: row.name || "(recent session)",
    score: 0,
    matchMode: "browse",
    matchedType: null,
    matchedEntryId: null,
    matchedAt: null,
  }));
}
