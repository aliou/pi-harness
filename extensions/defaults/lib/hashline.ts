import { readFile } from "node:fs/promises";
import xxhash from "xxhash-wasm";

// 16-char dictionary for 2-char hash encoding
const DICT = "ZPMQVRWSNKTXJBYH";

// Lazy-init hasher
let hasherPromise: Promise<{
  h32: (input: string, seed?: number) => number;
}> | null = null;

async function getHasher() {
  if (!hasherPromise) {
    hasherPromise = xxhash();
  }
  return hasherPromise;
}

/**
 * Compute a 2-char hash for a line.
 * Uses xxHash32 of whitespace-normalized content, truncated to 8 bits.
 * Line number is mixed in as seed for symbol-only lines to avoid collisions.
 */
export async function computeLineHash(
  lineNumber: number,
  lineContent: string,
): Promise<string> {
  const hasher = await getHasher();
  const normalized = lineContent.replace(/\s+/g, "");
  // Mix line number for symbol-only lines (braces, brackets) to avoid collisions
  const seed = /[a-zA-Z0-9]/.test(normalized) ? 0 : lineNumber;
  const h = hasher.h32(normalized, seed) & 0xff;
  const c1 = DICT[h >> 4];
  const c2 = DICT[h & 0xf];
  if (!c1 || !c2) throw new Error("Hash dictionary index out of bounds");
  return c1 + c2;
}

/**
 * Prefix each line of file content with `LINE#HASH:` tags.
 * Lines are numbered starting from startLine (default 1).
 */
export async function addHashlineTags(
  text: string,
  startLine: number = 1,
): Promise<string> {
  const lines = text.split("\n");
  const taggedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = startLine + i;
    const lineContent = lines[i];
    if (lineContent === undefined) continue; // Should never happen
    const hash = await computeLineHash(lineNumber, lineContent);
    taggedLines.push(`${lineNumber}#${hash}:${lineContent}`);
  }

  return taggedLines.join("\n");
}

/** Parsed tag: line number and 2-char hash. */
export interface ParsedTag {
  line: number;
  hash: string;
}

/**
 * Parse a single tag like "5#KT" into { line: 5, hash: "KT" }.
 * Returns null if invalid format.
 */
export function parseTag(tag: string): ParsedTag | null {
  const match = /^(\d+)#([A-Z]{2})$/.exec(tag);
  if (!match) return null;
  const lineStr = match[1];
  const hash = match[2];
  if (!lineStr || !hash) return null;
  return { line: parseInt(lineStr, 10), hash };
}

/** Parsed target: single tag or range. */
export interface ParsedTarget {
  start: ParsedTag;
  end: ParsedTag; // Same as start for single-line targets
}

/**
 * Parse a target string into start/end tags.
 * Accepts single tag "5#KT" or range "5#KT-8#VR".
 */
export function parseTarget(target: string): ParsedTarget | null {
  const parts = target.split("-");
  if (parts.length === 1) {
    const part = parts[0];
    if (!part) return null;
    const tag = parseTag(part);
    if (!tag) return null;
    return { start: tag, end: tag };
  }
  if (parts.length === 2) {
    const part0 = parts[0];
    const part1 = parts[1];
    if (!part0 || !part1) return null;
    const start = parseTag(part0);
    const end = parseTag(part1);
    if (!start || !end) return null;
    if (start.line > end.line) return null; // Invalid range
    return { start, end };
  }
  return null;
}

/** Result of tag validation. */
export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string; correctedTags?: string; context?: string };

/**
 * Validate that tags match the current file content.
 * Recomputes hashes for all referenced lines.
 * On mismatch, returns corrected tags with surrounding context.
 */
export async function validateTags(
  fileLines: string[],
  edits: Array<{ target: string; op: string }>,
): Promise<ValidationResult> {
  const hasher = await getHasher();

  // Collect all line numbers we need to validate
  const lineNumbers = new Set<number>();
  for (const edit of edits) {
    const parsed = parseTarget(edit.target);
    if (!parsed) {
      return { valid: false, error: `Invalid target format: ${edit.target}` };
    }
    for (let line = parsed.start.line; line <= parsed.end.line; line++) {
      lineNumbers.add(line);
    }
  }

  // Compute hashes for all referenced lines
  const actualHashes = new Map<number, string>();
  for (const lineNum of lineNumbers) {
    const lineIndex = lineNum - 1; // Convert to 0-indexed
    if (lineIndex < 0 || lineIndex >= fileLines.length) {
      return {
        valid: false,
        error: `Line ${lineNum} is out of range (file has ${fileLines.length} lines)`,
      };
    }
    const lineContent = fileLines[lineIndex];
    if (lineContent === undefined) {
      return {
        valid: false,
        error: `Line ${lineNum} is out of range`,
      };
    }
    const normalized = lineContent.replace(/\s+/g, "");
    const seed = /[a-zA-Z0-9]/.test(normalized) ? 0 : lineNum;
    const h = hasher.h32(normalized, seed) & 0xff;
    const c1 = DICT[h >> 4];
    const c2 = DICT[h & 0xf];
    if (!c1 || !c2) {
      return { valid: false, error: "Hash computation failed" };
    }
    actualHashes.set(lineNum, c1 + c2);
  }

  // Validate each edit's tags
  for (const edit of edits) {
    const parsed = parseTarget(edit.target);
    if (!parsed) {
      return { valid: false, error: `Invalid target format: ${edit.target}` };
    }

    // Check start tag
    const actualStartHash = actualHashes.get(parsed.start.line);
    if (
      actualStartHash === undefined ||
      actualStartHash !== parsed.start.hash
    ) {
      const corrected = `${parsed.start.line}#${actualStartHash ?? "unknown"}`;
      const context = buildContext(fileLines, parsed.start.line);
      const targetParts = edit.target.split("-");
      const gotTag = targetParts[0] ?? edit.target;
      return {
        valid: false,
        error: `Stale tag at line ${parsed.start.line}. Expected ${corrected}, got ${gotTag}`,
        correctedTags: corrected,
        context,
      };
    }

    // Check end tag (if range)
    if (parsed.end.line !== parsed.start.line) {
      const actualEndHash = actualHashes.get(parsed.end.line);
      if (actualEndHash === undefined || actualEndHash !== parsed.end.hash) {
        const corrected = `${parsed.end.line}#${actualEndHash ?? "unknown"}`;
        const context = buildContext(fileLines, parsed.end.line);
        return {
          valid: false,
          error: `Stale tag at line ${parsed.end.line}. Expected ${corrected}`,
          correctedTags: corrected,
          context,
        };
      }
    }
  }

  return { valid: true };
}

/** Build context string around a line number. */
function buildContext(
  fileLines: string[],
  centerLine: number,
  radius: number = 2,
): string {
  const start = Math.max(1, centerLine - radius);
  const end = Math.min(fileLines.length, centerLine + radius);
  const lines: string[] = [];
  for (let i = start; i <= end; i++) {
    const marker = i === centerLine ? ">>>" : "   ";
    const line = fileLines[i - 1] ?? "";
    lines.push(`${marker} ${i}| ${line}`);
  }
  return lines.join("\n");
}

/** Edit operation. */
export interface EditOp {
  op: "replace" | "insert_after" | "insert_before" | "delete";
  target: ParsedTarget;
  content?: string[];
}

/**
 * Apply edits to file lines.
 * Sorts by line number descending (bottom-up) to preserve line numbers during application.
 */
export function applyEdits(fileLines: string[], edits: EditOp[]): string[] {
  // Convert to mutable array
  const lines = [...fileLines];

  // Sort by start line descending (bottom-up)
  const sortedEdits = [...edits].sort(
    (a, b) => b.target.start.line - a.target.start.line,
  );

  for (const edit of sortedEdits) {
    const { op, target, content } = edit;
    const startIdx = target.start.line - 1; // 0-indexed
    const endIdx = target.end.line - 1; // 0-indexed

    switch (op) {
      case "replace": {
        // Remove old lines, insert new content
        const deleteCount = endIdx - startIdx + 1;
        if (content) {
          lines.splice(startIdx, deleteCount, ...content);
        } else {
          lines.splice(startIdx, deleteCount);
        }
        break;
      }

      case "delete": {
        // Remove lines
        const deleteCount = endIdx - startIdx + 1;
        lines.splice(startIdx, deleteCount);
        break;
      }

      case "insert_after": {
        // Insert after the target line
        if (content) {
          lines.splice(startIdx + 1, 0, ...content);
        }
        break;
      }

      case "insert_before": {
        // Insert before the target line
        if (content) {
          lines.splice(startIdx, 0, ...content);
        }
        break;
      }
    }
  }

  return lines;
}

/**
 * Generate a diff string matching the native edit tool's format.
 * Returns the diff and the first changed line number.
 */
export function generateDiff(
  originalLines: string[],
  newLines: string[],
  _path: string,
): { diff: string; firstChangedLine: number | undefined } {
  // Find first and last change
  let firstChange = -1;
  let lastChange = -1;

  const maxLen = Math.max(originalLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const origLine = originalLines[i];
    const newLine = newLines[i];
    if (origLine !== newLine) {
      if (firstChange === -1) firstChange = i;
      lastChange = i;
    }
  }

  if (firstChange === -1) {
    return { diff: "", firstChangedLine: undefined };
  }

  // Build diff with line numbers (matching native format)
  const contextLines = 4;
  const start = Math.max(0, firstChange - contextLines);
  const end = Math.min(newLines.length - 1, lastChange + contextLines);
  const lineNumWidth = String(
    Math.max(originalLines.length, newLines.length),
  ).length;

  const diffLines: string[] = [];
  let firstChangedLine: number | undefined;

  for (let i = start; i <= end; i++) {
    const origLine = originalLines[i];
    const newLine = newLines[i];
    const newLineNum = i + 1;
    const oldLineNum = i + 1;

    if (origLine === undefined && newLine !== undefined) {
      // Added line
      if (firstChangedLine === undefined) firstChangedLine = newLineNum;
      const num = String(newLineNum).padStart(lineNumWidth, " ");
      diffLines.push(`+${num} ${newLine}`);
    } else if (newLine === undefined && origLine !== undefined) {
      // Removed line
      if (firstChangedLine === undefined) firstChangedLine = newLineNum;
      const num = String(oldLineNum).padStart(lineNumWidth, " ");
      diffLines.push(`-${num} ${origLine}`);
    } else if (
      origLine !== undefined &&
      newLine !== undefined &&
      origLine !== newLine
    ) {
      // Changed line
      if (firstChangedLine === undefined) firstChangedLine = newLineNum;
      const oldNum = String(oldLineNum).padStart(lineNumWidth, " ");
      const newNum = String(newLineNum).padStart(lineNumWidth, " ");
      diffLines.push(`-${oldNum} ${origLine}`);
      diffLines.push(`+${newNum} ${newLine}`);
    } else if (origLine !== undefined) {
      // Context line
      const num = String(oldLineNum).padStart(lineNumWidth, " ");
      diffLines.push(` ${num} ${origLine}`);
    }
  }

  return { diff: diffLines.join("\n"), firstChangedLine };
}

/** Read file lines. */
export async function readFileLines(path: string): Promise<string[]> {
  const content = await readFile(path, "utf-8");
  // Remove trailing newline if present for consistent line handling
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  return normalized.split("\n");
}
