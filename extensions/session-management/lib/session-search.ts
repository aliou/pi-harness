/**
 * Session search using ripgrep (rg) for fast keyword-based searching across session files.
 *
 * Session files live at ~/.pi/agent/sessions/--encoded-cwd--/timestamp_uuid.jsonl
 * We use rg to efficiently search across 2263+ files without loading them all into memory.
 */

import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SessionSearchResult {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  matchedSnippet?: string;
}

export interface SearchOptions {
  query: string;
  cwd?: string;
  after?: string;
  before?: string;
  limit?: number;
}

/**
 * Parse relative date strings like "7d", "2w", "1m" or ISO dates.
 * Returns null if parsing fails.
 */
export function parseRelativeDate(input: string): Date | null {
  if (!input) return null;

  // Try ISO date format first
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Parse relative dates: "7d", "2w", "1m"
  const match = input.match(/^(\d+)([dwm])$/);
  if (!match) return null;

  const numStr = match[1];
  const unit = match[2];
  if (!numStr || !unit) return null;
  const num = parseInt(numStr, 10);
  const now = new Date();

  switch (unit) {
    case "d":
      now.setDate(now.getDate() - num);
      return now;
    case "w":
      now.setDate(now.getDate() - num * 7);
      return now;
    case "m":
      now.setMonth(now.getMonth() - num);
      return now;
    default:
      return null;
  }
}

/**
 * Get the sessions directory, respecting PI_CODING_AGENT_DIR env var.
 */
export function getSessionsDir(): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "sessions");
}

/**
 * Encode a cwd path to session directory format.
 * "/Users/foo/code" -> "--Users-foo-code--"
 */
export function encodeCwd(cwd: string): string {
  // Resolve to absolute path first to normalize ".." and "." segments.
  // Uses resolve() not realpathSync() because Pi stores sessions using the
  // logical path, not the symlink target.
  const resolved = resolve(cwd);
  // Strip leading slash, replace all slashes with hyphens
  const stripped = resolved.replace(/^[/\\]/, "");
  const encoded = stripped.replace(/[/\\]/g, "-");
  return `--${encoded}--`;
}

/**
 * Parse JSON JSONL line and extract text content from a message or compaction entry.
 */
function extractTextFromEntry(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;

  const obj = entry as Record<string, unknown>;

  // For message entries: {"type":"message","message":{"role":"user","content":"text or array"}}
  if (obj.type === "message" && obj.message) {
    const msg = obj.message as Record<string, unknown>;
    if (msg.role === "user" && msg.content) {
      const content = msg.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        // Extract text from content array (may contain {"type":"text","text":"..."})
        return content
          .filter(
            (c): c is Record<string, unknown> =>
              typeof c === "object" && c !== null,
          )
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .filter((t): t is string => typeof t === "string")
          .join(" ");
      }
    }
  }

  // For compaction entries: {"type":"compaction","summary":"..."}
  if (obj.type === "compaction" && obj.summary) {
    if (typeof obj.summary === "string") {
      return obj.summary;
    }
  }

  // For session_info entries: {"type":"session_info","name":"..."}
  if (obj.type === "session_info" && obj.name) {
    if (typeof obj.name === "string") {
      return obj.name;
    }
  }

  return undefined;
}

/**
 * Extract a single match snippet from a file using rg.
 * Returns the matched text truncated to 200 chars, or undefined if extraction fails.
 */
async function extractSnippet(
  filePath: string,
  query: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "rg",
      ["-m", "1", "--fixed-strings", "--", query, filePath],
      { maxBuffer: 1024 * 1024 },
    );

    if (!stdout) return undefined;

    // The line is the JSONL entry itself
    const line = stdout.trim();
    try {
      const entry = JSON.parse(line);
      const text = extractTextFromEntry(entry);
      if (text) {
        return text.length > 200 ? `${text.slice(0, 200)}...` : text;
      }
    } catch {
      // If JSON parsing fails, try to extract query from the raw line
      const idx = line.indexOf(query);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(line.length, idx + 100);
        const snippet = line.slice(start, end);
        return snippet.length > 200 ? `${snippet.slice(0, 200)}...` : snippet;
      }
    }
  } catch {
    // rg may fail if file can't be read or is not found
  }

  return undefined;
}

/**
 * Search for sessions by keyword using ripgrep.
 * Respects cwd and date filters, returns sorted results up to limit.
 * Resilient: skips bad files, never throws.
 */
export async function searchSessions(
  options: SearchOptions,
): Promise<SessionSearchResult[]> {
  const { query, cwd, after, before, limit = 10 } = options;

  if (!query || query.trim() === "") {
    return [];
  }

  const sessionsDir = getSessionsDir();
  let searchDirs: string[] = [];

  // Determine directories to search
  if (cwd) {
    const encoded = encodeCwd(cwd);
    const cwdDir = join(sessionsDir, encoded);
    searchDirs = [cwdDir];
  } else {
    // Search all subdirectories
    searchDirs = [sessionsDir];
  }

  // Parse date filters
  let afterDate: Date | null = null;
  let beforeDate: Date | null = null;

  if (after) {
    afterDate = parseRelativeDate(after);
  }

  if (before) {
    beforeDate = parseRelativeDate(before);
  }

  // Use rg to find matching files
  let matchingFiles: string[] = [];
  try {
    const { stdout } = await execFileAsync(
      "rg",
      [
        "--files-with-matches",
        "--fixed-strings",
        "--glob",
        "*.jsonl",
        "--",
        query,
        ...searchDirs,
      ],
      { maxBuffer: 10 * 1024 * 1024 }, // 10MB max output
    );

    if (stdout) {
      matchingFiles = stdout
        .split("\n")
        .filter((line) => line.length > 0)
        .slice(0, 100); // Cap at 100 files before detailed processing
    }
  } catch (err) {
    // rg returns exit code 1 if no matches found - this is normal
    const error = err as { status?: number };
    if (error.status === 1) {
      return [];
    }
    // For other errors, log but don't throw
    console.error("[session-search] rg search error:", err);
    return [];
  }

  // Process each matching file
  const results: SessionSearchResult[] = [];

  for (const filePath of matchingFiles) {
    try {
      // Read first line for session header
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      if (lines.length === 0) continue;

      let sessionHeader: {
        type?: string;
        id?: string;
        cwd?: string;
        timestamp?: string;
      } = {};

      try {
        const firstLine = lines[0];
        if (firstLine) {
          sessionHeader = JSON.parse(firstLine);
        }
      } catch {
        // Skip files with invalid first line
        continue;
      }

      const sessionId = sessionHeader.id;
      const sessionCwd = sessionHeader.cwd;

      if (!sessionId || sessionCwd === undefined) {
        continue;
      }

      // Get file modification time
      const stats = statSync(filePath);
      const modified = stats.mtime.toISOString();

      // Apply date filters
      const modifiedDate = new Date(modified);
      if (afterDate && modifiedDate < afterDate) continue;
      if (beforeDate && modifiedDate > beforeDate) continue;

      // Bounded scan: extract metadata from up to 500 lines
      let messageCount = 0;
      let firstMessage = "";
      let sessionName: string | undefined;

      for (let i = 0; i < Math.min(500, lines.length); i++) {
        const line = lines[i];
        if (!line) continue;

        try {
          const entry = JSON.parse(line);

          // Count messages
          if (entry.type === "message") {
            messageCount++;
            // Capture first user message
            if (!firstMessage && entry.message?.role === "user") {
              firstMessage = extractTextFromEntry(entry) || "";
              if (firstMessage.length > 100) {
                firstMessage = `${firstMessage.slice(0, 100)}...`;
              }
            }
          }

          // Capture session name
          if (!sessionName && entry.type === "session_info" && entry.name) {
            sessionName = entry.name;
          }

          // Stop if we have all needed data
          if (messageCount > 0 && firstMessage && sessionName) {
            break;
          }
        } catch {
          // Skip lines that can't be parsed
        }
      }

      // Extract snippet for the match
      const snippet = await extractSnippet(filePath, query);

      results.push({
        id: sessionId,
        path: filePath,
        cwd: sessionCwd,
        name: sessionName,
        created: sessionHeader.timestamp || modified,
        modified,
        messageCount,
        firstMessage: firstMessage || "(no messages yet)",
        matchedSnippet: snippet,
      });
    } catch (err) {
      // Skip files that can't be processed
      console.error(`[session-search] Error processing ${filePath}:`, err);
    }
  }

  // Sort by modified date (descending), apply limit
  results.sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
  );
  return results.slice(0, limit);
}
