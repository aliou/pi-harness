import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent, UserMessage } from "@earendil-works/pi-ai";
import { detectImageMimeTypeFromBuffer } from "@harness/image-formats";

// Matches image file extensions, lookahead ensures the extension is at
// a word/sentence boundary (space, punctuation, or end of string).
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp)(?=[\s"'`,;)\]\\!?\]]|$)/gi;

/**
 * Check if user message text references any local image files that exist on disk.
 *
 * Extracts candidate paths from text and verifies each one actually exists.
 * This naturally filters out URLs (which won't resolve to local files)
 * and non-existent paths (prose that happens to contain an image extension).
 */
export function referencesImageFiles(text: string, cwd: string): boolean {
  return findReferencedImageFiles(text, cwd).length > 0;
}

export function findReferencedImageFiles(text: string, cwd: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  // Reset lastIndex — the module-level regex has the global flag,
  // so lastIndex persists between calls. Without this, consecutive
  // calls can skip matches.
  IMAGE_EXT_RE.lastIndex = 0;

  let match = IMAGE_EXT_RE.exec(text);
  while (match !== null) {
    const extEnd = match.index + match[0].length;

    // Extract candidate: from last whitespace boundary to extension end
    let start = match.index;
    while (start > 0 && !/\s/.test(text[start - 1] ?? "")) start--;
    let candidate = text.slice(start, extEnd);
    let resolved = resolveExistingPath(candidate, cwd);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      paths.push(resolved);
      match = IMAGE_EXT_RE.exec(text);
      continue;
    }

    // Try extending backward through spaces to handle paths with spaces
    // (e.g. macOS screenshot paths like
    //   /Users/foo/Screenshot 2026-03-01 at 08.49.52 PM@2x.png)
    // Only try if there is a "/" somewhere before the candidate in the
    // current line, suggesting this could be a continuation of a filesystem path.
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const textBefore = text.slice(lineStart, start);
    if (candidate.includes("/") || textBefore.includes("/")) {
      let extended = start;
      while (extended > 0) {
        const prevSpace = text.lastIndexOf(" ", extended - 2);
        if (prevSpace < 0) {
          extended = 0;
        } else {
          // Stop at newlines — paths don't span across lines
          if (text[prevSpace - 1] === "\n") break;
          extended = prevSpace + 1;
        }
        candidate = text.slice(extended, extEnd);
        resolved = resolveExistingPath(candidate, cwd);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          paths.push(resolved);
          break;
        }
      }
    }

    match = IMAGE_EXT_RE.exec(text);
  }

  return paths;
}

function resolveExistingPath(filePath: string, cwd: string): string | null {
  if (filePath.startsWith("~")) {
    filePath = filePath.replace(/^~/, homedir());
  }
  if (!filePath.startsWith("/")) {
    filePath = resolve(cwd, filePath);
  }
  return existsSync(filePath) ? filePath : null;
}

export function detectSupportedImageMimeType(
  buffer: Uint8Array,
): string | null {
  return detectImageMimeTypeFromBuffer(buffer);
}

export function isVisionCapable(model: { input: string[] }): boolean {
  return model.input.includes("image");
}

/** Extract the concatenated text of a user message's content. */
function userMessageText(content: UserMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function buildLookAtGuidance(paths: string[]): string {
  const list = paths.map((path) => `- ${path}`).join("\n");
  return `The user referenced image files. You cannot see images directly; use the look_at tool to analyze each one before answering.\n\nImages:\n${list}`;
}

/**
 * If the last message is a user message referencing local image files, append
 * look_at guidance to it. Mutates the message in place (the context event
 * provides a deep copy). Returns true when guidance was added.
 */
export function injectLookAtGuidance(
  messages: AgentMessage[],
  cwd: string,
): boolean {
  const last = messages.at(-1);
  if (last?.role !== "user") return false;

  const paths = findReferencedImageFiles(userMessageText(last.content), cwd);
  if (paths.length === 0) return false;

  const guidance = buildLookAtGuidance(paths);
  if (typeof last.content === "string") {
    last.content = `${last.content}\n\n${guidance}`;
  } else if (Array.isArray(last.content)) {
    last.content = [...last.content, { type: "text", text: guidance }];
  }
  return true;
}
