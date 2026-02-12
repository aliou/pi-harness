/**
 * Hashline edit tool for Pi.
 *
 * Overrides read and edit tools to use line-addressable format with content hashes.
 * Each line is identified by LINE:HASH pairs for integrity checking.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";

// ═══════════════════════════════════════════════════════════════════════════
// Hash Computation
// ═══════════════════════════════════════════════════════════════════════════

const HASH_LEN = 2;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN; // 256

const DICT = Array.from({ length: HASH_MOD }, (_, i) =>
  i.toString(RADIX).padStart(HASH_LEN, "0"),
);

/**
 * Simple hash function for line content.
 * Uses a basic string hash algorithm (djb2) since Bun.hash may not be available.
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit
}

/**
 * Compute a short hash of a single line.
 * Normalizes whitespace before hashing to ignore formatting changes.
 */
export function computeLineHash(_idx: number, line: string): string {
  if (line.endsWith("\r")) {
    line = line.slice(0, -1);
  }
  line = line.replace(/\s+/g, ""); // Strip all whitespace
  const hash = DICT[simpleHash(line) % HASH_MOD];
  if (hash === undefined) {
    throw new Error("Hash computation failed");
  }
  return hash;
}

/**
 * Format file content with hashline prefixes for display.
 * Each line becomes `LINENUM:HASH|CONTENT` where LINENUM is 1-indexed.
 */
export function formatHashLines(content: string, startLine = 1): string {
  const lines = content.split("\n");
  const formatted = lines
    .map((line, i) => {
      const num = startLine + i;
      const hash = computeLineHash(num, line);
      return `${num}:${hash}|${line}`;
    })
    .join("\n");
  return formatted;
}

// ═══════════════════════════════════════════════════════════════════════════
// Reference Parsing
// ═══════════════════════════════════════════════════════════════════════════

const HASHLINE_PREFIX_RE = /^\d+:[0-9a-zA-Z]{1,16}\|/;

/**
 * Parse a line reference string like `"5:ab"` into structured form.
 */
export function parseLineRef(ref: string): { line: number; hash: string } {
  // Strip display-format suffix: "5:ab|some content" → "5:ab"
  const cleaned = ref
    .replace(/\|.*$/, "")
    .replace(/ {2}.*$/, "")
    .trim();
  const normalized = cleaned.replace(/\s*:\s*/, ":");
  const match = normalized.match(/^(\d+):([0-9a-zA-Z]{1,16})$/);

  if (!match) {
    throw new Error(
      `Invalid line reference "${ref}". Expected format "LINE:HASH" (e.g. "5:aa").`,
    );
  }

  // biome-ignore lint/style/noNonNullAssertion: match guaranteed by regex above
  const line = Number.parseInt(match[1]!, 10);
  if (line < 1) {
    throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`);
  }
  // biome-ignore lint/style/noNonNullAssertion: match guaranteed by regex above
  const hash = match[2]!;
  return { line, hash };
}

/**
 * Strip hashline display prefixes from replacement lines.
 * Models frequently copy the `LINE:HASH|` prefix from read output.
 */
function stripNewLinePrefixes(lines: string[]): string[] {
  let hashPrefixCount = 0;
  let nonEmpty = 0;

  for (const l of lines) {
    if (l.length === 0) continue;
    nonEmpty++;
    if (HASHLINE_PREFIX_RE.test(l)) hashPrefixCount++;
  }

  if (nonEmpty === 0) return lines;
  const stripHash = hashPrefixCount > 0 && hashPrefixCount >= nonEmpty * 0.5;

  if (!stripHash) return lines;
  return lines.map((l) => l.replace(HASHLINE_PREFIX_RE, ""));
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════════

export interface HashMismatch {
  line: number;
  expected: string;
  actual: string;
}

const MISMATCH_CONTEXT = 2;

export class HashlineMismatchError extends Error {
  readonly remaps: ReadonlyMap<string, string>;

  constructor(
    public readonly mismatches: HashMismatch[],
    public readonly fileLines: string[],
  ) {
    super(HashlineMismatchError.formatMessage(mismatches, fileLines));
    this.name = "HashlineMismatchError";

    const remaps = new Map<string, string>();
    for (const m of mismatches) {
      const line = fileLines[m.line - 1];
      if (line !== undefined) {
        const actual = computeLineHash(m.line, line);
        remaps.set(`${m.line}:${m.expected}`, `${m.line}:${actual}`);
      }
    }
    this.remaps = remaps;
  }

  static formatMessage(
    mismatches: HashMismatch[],
    fileLines: string[],
  ): string {
    const mismatchSet = new Map<number, HashMismatch>();
    for (const m of mismatches) {
      mismatchSet.set(m.line, m);
    }

    const displayLines = new Set<number>();
    for (const m of mismatches) {
      const lo = Math.max(1, m.line - MISMATCH_CONTEXT);
      const hi = Math.min(fileLines.length, m.line + MISMATCH_CONTEXT);
      for (let i = lo; i <= hi; i++) {
        displayLines.add(i);
      }
    }

    const sorted = [...displayLines].sort((a, b) => a - b);
    const lines: string[] = [];

    lines.push(
      `${mismatches.length} line${mismatches.length > 1 ? "s have" : " has"} changed since last read. Use the updated LINE:HASH references shown below (>>> marks changed lines).`,
    );
    lines.push("");

    let prevLine = -1;
    for (const lineNum of sorted) {
      if (prevLine !== -1 && lineNum > prevLine + 1) {
        lines.push("    ...");
      }
      prevLine = lineNum;

      const content = fileLines[lineNum - 1];
      if (content !== undefined) {
        const hash = computeLineHash(lineNum, content);
        const prefix = `${lineNum}:${hash}`;

        if (mismatchSet.has(lineNum)) {
          lines.push(`>>> ${prefix}|${content}`);
        } else {
          lines.push(`    ${prefix}|${content}`);
        }
      }
    }

    const remapEntries: string[] = [];
    for (const m of mismatches) {
      const line = fileLines[m.line - 1];
      if (line !== undefined) {
        const actual = computeLineHash(m.line, line);
        remapEntries.push(`\t${m.line}:${m.expected} → ${m.line}:${actual}`);
      }
    }
    if (remapEntries.length > 0) {
      lines.push("");
      lines.push("Quick fix — replace stale refs:");
      lines.push(...remapEntries);
    }
    return lines.join("\n");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Edit Application
// ═══════════════════════════════════════════════════════════════════════════

export type HashlineEdit =
  | { set_line: { anchor: string; new_text: string } }
  | {
      replace_lines: {
        start_anchor: string;
        end_anchor: string;
        new_text: string;
      };
    }
  | { insert_after: { anchor: string; text: string } };

/**
 * Apply hashline edits to file content.
 * Edits are sorted bottom-up so earlier splices don't invalidate later line numbers.
 */
export function applyHashlineEdits(
  content: string,
  edits: HashlineEdit[],
): {
  content: string;
  firstChangedLine: number | undefined;
} {
  if (edits.length === 0) {
    return { content, firstChangedLine: undefined };
  }

  const fileLines = content.split("\n");
  let firstChangedLine: number | undefined;

  // Parse all edits and validate hashes upfront
  const parsed = edits.map((edit) => {
    if ("set_line" in edit) {
      const ref = parseLineRef(edit.set_line.anchor);
      return {
        type: "set" as const,
        line: ref.line,
        hash: ref.hash,
        newText: stripNewLinePrefixes([edit.set_line.new_text]),
      };
    }
    if ("replace_lines" in edit) {
      const start = parseLineRef(edit.replace_lines.start_anchor);
      const end = parseLineRef(edit.replace_lines.end_anchor);
      return {
        type: "replace" as const,
        startLine: start.line,
        startHash: start.hash,
        endLine: end.line,
        endHash: end.hash,
        newText: stripNewLinePrefixes(edit.replace_lines.new_text.split("\n")),
      };
    }
    // insert_after
    const ref = parseLineRef(edit.insert_after.anchor);
    return {
      type: "insert" as const,
      line: ref.line,
      hash: ref.hash,
      newText: stripNewLinePrefixes(edit.insert_after.text.split("\n")),
    };
  });

  // Validate line numbers exist
  for (const p of parsed) {
    if (p.type === "set" || p.type === "insert") {
      if (p.line < 1 || p.line > fileLines.length) {
        throw new Error(
          `Line ${p.line} does not exist (file has ${fileLines.length} lines)`,
        );
      }
    } else {
      if (p.startLine < 1 || p.startLine > fileLines.length) {
        throw new Error(
          `Line ${p.startLine} does not exist (file has ${fileLines.length} lines)`,
        );
      }
      if (p.endLine < 1 || p.endLine > fileLines.length) {
        throw new Error(
          `Line ${p.endLine} does not exist (file has ${fileLines.length} lines)`,
        );
      }
    }
  }

  // Validate all hashes before applying any edits
  // Line numbers are already validated to exist above, so array access is safe
  const mismatches: HashMismatch[] = [];
  for (const p of parsed) {
    if (p.type === "set" || p.type === "insert") {
      // biome-ignore lint/style/noNonNullAssertion: line bounds validated above
      const line = fileLines[p.line - 1]!;
      const actualHash = computeLineHash(p.line, line);
      if (actualHash !== p.hash.toLowerCase()) {
        mismatches.push({ line: p.line, expected: p.hash, actual: actualHash });
      }
    } else {
      // biome-ignore lint/style/noNonNullAssertion: line bounds validated above
      const startLine = fileLines[p.startLine - 1]!;
      // biome-ignore lint/style/noNonNullAssertion: line bounds validated above
      const endLine = fileLines[p.endLine - 1]!;
      const startHash = computeLineHash(p.startLine, startLine);
      const endHash = computeLineHash(p.endLine, endLine);
      if (startHash !== p.startHash.toLowerCase()) {
        mismatches.push({
          line: p.startLine,
          expected: p.startHash,
          actual: startHash,
        });
      }
      if (endHash !== p.endHash.toLowerCase()) {
        mismatches.push({
          line: p.endLine,
          expected: p.endHash,
          actual: endHash,
        });
      }
    }
  }

  if (mismatches.length > 0) {
    throw new HashlineMismatchError(mismatches, fileLines);
  }

  // Sort edits bottom-up (highest line first)
  const sorted = [...parsed].sort((a, b) => {
    const aLine = a.type === "replace" ? a.endLine : a.line;
    const bLine = b.type === "replace" ? b.endLine : b.line;
    return bLine - aLine;
  });

  // Apply edits
  for (const edit of sorted) {
    if (edit.type === "set") {
      fileLines.splice(edit.line - 1, 1, ...edit.newText);
      if (firstChangedLine === undefined || edit.line < firstChangedLine) {
        firstChangedLine = edit.line;
      }
    } else if (edit.type === "replace") {
      const count = edit.endLine - edit.startLine + 1;
      fileLines.splice(edit.startLine - 1, count, ...edit.newText);
      if (firstChangedLine === undefined || edit.startLine < firstChangedLine) {
        firstChangedLine = edit.startLine;
      }
    } else {
      // insert_after
      fileLines.splice(edit.line, 0, ...edit.newText);
      if (firstChangedLine === undefined || edit.line + 1 < firstChangedLine) {
        firstChangedLine = edit.line + 1;
      }
    }
  }

  return {
    content: fileLines.join("\n"),
    firstChangedLine,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool Setup
// ═══════════════════════════════════════════════════════════════════════════

const hashlineEditSchema = Type.Object({
  path: Type.String({
    description: "Path to the file to edit",
  }),
  edits: Type.Array(
    Type.Union([
      Type.Object({
        set_line: Type.Object({
          anchor: Type.String({
            description: 'Line reference like "5:ab" from read output',
          }),
          new_text: Type.String({
            description: "New content for this line",
          }),
        }),
      }),
      Type.Object({
        replace_lines: Type.Object({
          start_anchor: Type.String({
            description: 'Starting line reference like "5:ab"',
          }),
          end_anchor: Type.String({
            description: 'Ending line reference like "10:cd"',
          }),
          new_text: Type.String({
            description: "New content to replace the range (can be multi-line)",
          }),
        }),
      }),
      Type.Object({
        insert_after: Type.Object({
          anchor: Type.String({
            description: 'Line reference like "5:ab" to insert after',
          }),
          text: Type.String({
            description: "Content to insert (can be multi-line)",
          }),
        }),
      }),
    ]),
    {
      description: "Array of edit operations to apply",
    },
  ),
});

type HashlineEditParams = Static<typeof hashlineEditSchema>;

export function setupHashlineTools(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const nativeRead = createReadTool(cwd);

  // Register hashline read tool (does not override standard read)
  pi.registerTool({
    ...nativeRead,
    name: "hashline_read",
    label: "Read (Hashline)",
    description:
      "Read the contents of a file with line-addressable format. Each line is prefixed with LINE:HASH| for precise editing.",
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await nativeRead.execute(
        _toolCallId,
        params as { path: string; offset?: number; limit?: number },
        _signal,
        _onUpdate,
      );

      // Transform text content to add hash prefixes
      if (
        result.content &&
        Array.isArray(result.content) &&
        result.content[0]?.type === "text"
      ) {
        const originalText = result.content[0].text;
        const hashedText = formatHashLines(originalText);
        result.content[0].text = hashedText;
      }

      return result;
    },
  });

  // Register hashline edit tool (does not override standard edit)
  pi.registerTool({
    name: "hashline_edit",
    label: "Edit (Hashline)",
    description: `Edit files using line-addressable format with content hashes.

Use LINE:HASH anchors from read output to precisely target edits.
Supports three operations:
- set_line: Replace a single line
- replace_lines: Replace a range of lines
- insert_after: Insert new lines after a specific line

Hashes ensure edits are only applied if the file hasn't changed since the last read.`,
    parameters: hashlineEditSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { path, edits } = params as HashlineEditParams;
      const absolutePath = resolve(ctx.cwd, path);

      try {
        const content = await readFile(absolutePath, "utf-8");
        const result = applyHashlineEdits(content, edits);
        await writeFile(absolutePath, result.content, "utf-8");

        return {
          content: [
            {
              type: "text" as const,
              text: `Successfully edited ${path}. Modified ${edits.length} location${edits.length === 1 ? "" : "s"}${result.firstChangedLine ? ` starting at line ${result.firstChangedLine}` : ""}.`,
            },
          ],
          details: {
            firstChangedLine: result.firstChangedLine,
            editCount: edits.length,
          },
        };
      } catch (error) {
        if (error instanceof HashlineMismatchError) {
          return {
            content: [{ type: "text" as const, text: error.message }],
            details: {
              error: "hash_mismatch",
              remaps: Object.fromEntries(error.remaps),
            },
          };
        }
        throw error;
      }
    },
  });
}
