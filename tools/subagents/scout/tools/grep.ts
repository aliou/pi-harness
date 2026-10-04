import { type ChildProcess, spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_MAX_BYTES,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const GREP_MAX_LINE_LENGTH = 500;
const DEFAULT_LIMIT = 100;
/** Per-line retention cap: a line past this is discarded and reported instead of kept. */
const MAX_LINE_BYTES = 64 * 1024 * 1024;
/** Bytes of a discarded line retained for the path-extraction notice. */
const OVERSIZED_PREFIX_BYTES = 8 * 1024;
/** Files above this size are skipped when building context lines. */
const CONTEXT_FILE_MAX_BYTES = 8 * 1024 * 1024;

const grepSchema = Type.Object({
  pattern: Type.String({
    description: "Search pattern (regex or literal string)",
  }),
  path: Type.Optional(
    Type.String({
      description: "Directory or file to search (default: current directory)",
    }),
  ),
  glob: Type.Optional(
    Type.String({
      description:
        "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'",
    }),
  ),
  ignoreCase: Type.Optional(
    Type.Boolean({ description: "Case-insensitive search (default: false)" }),
  ),
  literal: Type.Optional(
    Type.Boolean({
      description:
        "Treat pattern as literal string instead of regex (default: false)",
    }),
  ),
  context: Type.Optional(
    Type.Number({
      description:
        "Number of lines to show before and after each match (default: 0)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: `Maximum number of matches to return (default: ${DEFAULT_LIMIT})`,
    }),
  ),
});

export type ScoutGrepDetails = {
  matchLimitReached?: number;
  linesTruncated?: boolean;
  oversizedDiscarded?: number;
  truncated?: boolean;
};

interface RipgrepMatch {
  filePath: string;
  lineNumber: number;
  lineText?: string;
  wasTruncated?: boolean;
}

function textResult(text: string, details?: ScoutGrepDetails) {
  return { content: [{ type: "text" as const, text }], details };
}

function truncateText(text: string): { text: string; wasTruncated: boolean } {
  if (text.length <= GREP_MAX_LINE_LENGTH) return { text, wasTruncated: false };
  return {
    text: `${text.slice(0, GREP_MAX_LINE_LENGTH)}...`,
    wasTruncated: true,
  };
}

function formatMatchLine(
  relativePath: string,
  lineNumber: number,
  rawLine: string,
) {
  const sanitized = rawLine
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/\n$/, "");
  const { text, wasTruncated } = truncateText(sanitized);
  return { text: `${relativePath}:${lineNumber}: ${text}`, wasTruncated };
}

function relativeTo(searchPath: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? path.relative(searchPath, filePath) || filePath
    : filePath;
}

function exitCode(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", (error) =>
      reject(new Error(`Failed to run ripgrep: ${error.message}`)),
    );
    child.once("close", (code) => resolve(code));
  });
}

/**
 * Split a UTF-8 byte stream into LF-delimited lines without ever retaining a
 * line past maxLineBytes. Unlike node:readline (which grows one line by string
 * concatenation with no cap), an enormous single-line record cannot push
 * retention past V8's max string length; oversized lines are reported once
 * with their first OVERSIZED_PREFIX_BYTES and framing resynchronizes at the
 * next LF. Trailing CR is stripped.
 */
async function* cappedLines(
  source: ChildProcess["stdout"],
  maxLineBytes: number,
) {
  if (!source) throw new Error("ripgrep produced no stdout pipe");
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  const prefixParts: Buffer[] = [];
  let prefixBytes = 0;
  let oversized = false;

  const reset = () => {
    pending = [];
    pendingBytes = 0;
    prefixParts.length = 0;
    prefixBytes = 0;
    oversized = false;
  };

  const push = (segment: Buffer) => {
    if (oversized) return;
    if (prefixBytes < OVERSIZED_PREFIX_BYTES) {
      const take = segment.subarray(
        0,
        Math.min(segment.length, OVERSIZED_PREFIX_BYTES - prefixBytes),
      );
      prefixParts.push(take);
      prefixBytes += take.length;
    }
    if (pendingBytes + segment.length > maxLineBytes) {
      oversized = true;
      return;
    }
    pending.push(segment);
    pendingBytes += segment.length;
  };

  const emitLine = ():
    | string
    | { oversized: true; prefix: string }
    | undefined => {
    try {
      if (!oversized) {
        let line = Buffer.concat(pending).toString("utf-8");
        if (line.endsWith("\r")) line = line.slice(0, -1);
        return line;
      }
      return {
        oversized: true,
        prefix: Buffer.concat(prefixParts)
          .subarray(0, OVERSIZED_PREFIX_BYTES)
          .toString("utf-8"),
      };
    } finally {
      reset();
    }
  };

  for await (const chunk of source) {
    const buffer: Buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);
    let from = 0;
    while (from < buffer.length) {
      const nl = buffer.indexOf(0x0a, from);
      if (nl === -1) {
        push(buffer.subarray(from));
        break;
      }
      push(buffer.subarray(from, nl));
      const line = emitLine();
      if (line !== undefined) yield line;
      from = nl + 1;
    }
  }
  if (pending.length > 0 || prefixParts.length > 0) {
    const line = emitLine();
    if (line !== undefined) yield line;
  }
}

function isOversizedLine(
  line: unknown,
): line is { oversized: true; prefix: string } {
  return (
    typeof line === "object" &&
    line !== null &&
    (line as { oversized?: boolean }).oversized === true
  );
}

/** Extract the file path from the beginning of an oversized `rg --json` event line. */
function pathFromEventPrefix(prefix: string): string | undefined {
  const match = prefix.match(/"path":\{"text":"((?:[^"\\]|\\.)*)"/);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return undefined;
  }
}

async function contextBlock(
  match: RipgrepMatch,
  searchPath: string,
  contextValue: number,
): Promise<string[]> {
  const relativePath = relativeTo(searchPath, match.filePath);
  const matchLine =
    match.lineText !== undefined
      ? formatMatchLine(relativePath, match.lineNumber, match.lineText).text
      : `${relativePath}:${match.lineNumber}`;
  try {
    const info = await stat(match.filePath);
    if (info.size > CONTEXT_FILE_MAX_BYTES) {
      match.wasTruncated = true;
      return [matchLine, `${relativePath}: (context omitted, file too large)`];
    }
    const content = await readFile(match.filePath, "utf-8");
    const fileLines = content.replace(/\r\n/g, "\n").split("\n");
    const block: string[] = [];
    const start = Math.max(1, match.lineNumber - contextValue);
    const end = Math.min(fileLines.length, match.lineNumber + contextValue);
    for (let current = start; current <= end; current++) {
      const { text, wasTruncated } = truncateText(
        (fileLines[current - 1] ?? "").replace(/\r/g, ""),
      );
      const separator = current === match.lineNumber ? ":" : "-";
      block.push(`${relativePath}${separator}${current}${separator} ${text}`);
      if (wasTruncated) match.wasTruncated = true;
    }
    return block;
  } catch {
    return [`${relativePath}:${match.lineNumber}: (unable to read file)`];
  }
}

/**
 * rg-backed grep for the scout subagent. Child stdout is read through
 * cappedLines instead of node:readline, so one enormous matched line (a
 * one-line JSON export or minified bundle) is discarded with an explicit
 * notice rather than throwing `RangeError: Invalid string length` from the
 * stream's data handler and killing the whole pi process. This is the same
 * fix pi needs upstream (earendil-works/pi#8532, auto-closed 2026-08-23).
 */
export function createScoutGrepTool(
  cwd: string,
  /** Test seam: per-line retention cap override. */
  maxLineBytes = MAX_LINE_BYTES,
): ToolDefinition<typeof grepSchema, ScoutGrepDetails | undefined> {
  return {
    name: "grep",
    label: "Grep",
    description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB. Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars. Oversized single-line records are skipped and reported.`,
    promptSnippet: "Search file contents for patterns (respects .gitignore)",
    parameters: grepSchema,
    async execute(
      _toolCallId,
      { pattern, path: searchDir, glob, ignoreCase, literal, context, limit },
      signal,
      _onUpdate,
      ctx,
    ) {
      const searchPath = path.resolve(
        searchDir ? ctx.cwd : cwd,
        searchDir ?? ".",
      );
      const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
      const contextValue = context && context > 0 ? context : 0;

      const args = ["--json", "--line-number", "--color=never", "--hidden"];
      if (ignoreCase) args.push("--ignore-case");
      if (literal) args.push("--fixed-strings");
      if (glob) args.push("--glob", glob);
      args.push("--", pattern, searchPath);

      const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
      const killChild = () => {
        if (!child.killed) child.kill();
      };
      const onAbort = () => killChild();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const matches: RipgrepMatch[] = [];
        const oversizedPrefixes: string[] = [];
        let stderr = "";
        let matchCount = 0;
        let matchLimitReached = false;
        let linesTruncated = false;
        child.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        const handleLine = (
          line: string | { oversized: true; prefix: string },
        ) => {
          if (isOversizedLine(line)) {
            oversizedPrefixes.push(line.prefix);
            matchCount++;
            // A discarded event may be a match; count it against the limit.
            if (matchCount >= effectiveLimit) matchLimitReached = true;
            if (matchLimitReached) killChild();
            return;
          }
          let event: {
            type?: string;
            data?: {
              path?: { text?: string };
              line_number?: number;
              lines?: { text?: string };
            };
          };
          try {
            event = JSON.parse(line);
          } catch {
            return;
          }
          if (event.type !== "match") return;
          matchCount++;
          const filePath = event.data?.path?.text;
          const lineNumber = event.data?.line_number;
          if (filePath && typeof lineNumber === "number") {
            matches.push({
              filePath,
              lineNumber,
              lineText: event.data?.lines?.text,
            });
          }
          if (matchCount >= effectiveLimit) matchLimitReached = true;
          if (matchLimitReached) killChild();
        };

        const consume = async () => {
          for await (const line of cappedLines(child.stdout, maxLineBytes)) {
            handleLine(line);
          }
        };

        const [code] = await Promise.all([exitCode(child), consume()]);

        if (signal?.aborted) throw new Error("Operation aborted");
        if (code !== null && code !== 0 && code !== 1 && !matchLimitReached) {
          throw new Error(stderr.trim() || `ripgrep exited with code ${code}`);
        }

        const oversizedDiscarded = oversizedPrefixes.length;
        const oversizedPaths = new Set<string>();
        for (const prefix of oversizedPrefixes) {
          const filePath = pathFromEventPrefix(prefix);
          if (filePath) oversizedPaths.add(relativeTo(searchPath, filePath));
        }

        const outputLines: string[] = [];
        if (contextValue === 0) {
          for (const match of matches) {
            if (match.lineText === undefined) continue;
            const { text, wasTruncated } = formatMatchLine(
              relativeTo(searchPath, match.filePath),
              match.lineNumber,
              match.lineText,
            );
            if (wasTruncated) linesTruncated = true;
            outputLines.push(text);
          }
        } else {
          for (const match of matches) {
            const block = await contextBlock(match, searchPath, contextValue);
            outputLines.push(...block);
            if (match.wasTruncated) linesTruncated = true;
          }
        }

        if (!outputLines.length && oversizedDiscarded === 0) {
          return textResult("No matches found");
        }

        let output = outputLines.join("\n");
        let truncated = false;
        if (Buffer.byteLength(output, "utf-8") > DEFAULT_MAX_BYTES) {
          output = `${output.slice(0, DEFAULT_MAX_BYTES)}...`;
          truncated = true;
        }

        const notices: string[] = [];
        const details: ScoutGrepDetails = {};
        if (matchLimitReached) {
          notices.push(
            `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
          );
          details.matchLimitReached = effectiveLimit;
        }
        if (truncated) {
          notices.push(`${DEFAULT_MAX_BYTES / 1024}KB limit reached`);
          details.truncated = true;
        }
        if (linesTruncated) {
          notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars`);
          details.linesTruncated = true;
        }
        if (oversizedDiscarded > 0) {
          const where =
            oversizedPaths.size > 0
              ? ` in ${[...oversizedPaths].join(", ")}`
              : "";
          notices.push(
            `${oversizedDiscarded} oversized line(s)${where} skipped — matches may be MISSING there. Read the file directly or narrow the search`,
          );
          details.oversizedDiscarded = oversizedDiscarded;
        }
        if (notices.length > 0 && output) {
          output = `${output}\n\n[${notices.join(". ")}]`;
        } else if (notices.length > 0) {
          output = notices.join(". ");
        }

        return textResult(
          output,
          Object.keys(details).length > 0 ? details : undefined,
        );
      } finally {
        signal?.removeEventListener("abort", onAbort);
        killChild();
      }
    },
  };
}
