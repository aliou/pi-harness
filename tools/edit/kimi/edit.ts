/**
 * Kimi K2.7 Code `edit` tool override.
 *
 * Moonshot's native Kimi Code harness exposes an exact replacement tool with
 * `old_string` / `new_string` rather than Pi's default `edits[].oldText` shape.
 * This definition intentionally keeps the public tool name `edit` so Kimi sees
 * its in-distribution edit contract when the router selects a Kimi model.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  generateDiffString,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  buildEditOutput,
  EDIT_ANNOTATIONS,
  EditOutputSchema,
} from "../shared/output";
import {
  type KimiEditRenderState,
  renderKimiEditCall,
  renderKimiEditResult,
} from "./render";

const KIMI_EDIT_DESCRIPTION = `Perform exact replacements in existing files.

- Edit is mandatory for every incremental change, especially small edits. DO NOT use Write or Bash \`sed\`.
- Read the target file before every Edit. DO NOT call Edit from memory, stale context, or a guessed \`old_string\`.
- Take \`old_string\` and \`new_string\` from the Read output view.
- Drop the line-number prefix and tab; match only file content.
- \`old_string\` must be unique unless \`replace_all\` is set.
- If \`old_string\` is ambiguous, add surrounding context. Use \`replace_all\` only when every occurrence should change -- for example, renaming a symbol throughout the file.
- Multiple Edit calls may run in one response only when they do not target the same file.
- DO NOT issue consecutive Edit calls on the same file. A previous Edit can invalidate a later Edit's \`old_string\`, causing \`old_string not found\`. Read the file again before the next Edit.
- For pure CRLF files, Read shows LF; use LF in \`old_string\` and \`new_string\`, and Edit writes CRLF back.
- For mixed endings or lone carriage returns, Read shows carriage returns as \\r; include actual \\r escapes in those positions.`;

const KIMI_EDIT_GUIDELINES = [
  "edit: Use for every incremental file change when running Kimi K2.7 Code. Do not use Write or Bash `sed` for small edits.",
  "edit: Read the target file first; use exact `old_string` and `new_string` from the Read output, without line numbers.",
  "edit: Do not issue consecutive same-file edit calls without reading the file again. Use `replace_all` only when every occurrence should change.",
];

const KIMI_EDIT_SCHEMA = Type.Object(
  {
    path: Type.String({
      description:
        "Path to the text file to edit. Relative paths resolve against the working directory; a path outside the working directory must be absolute.",
    }),
    old_string: Type.String({
      minLength: 1,
      description:
        "Exact content to replace from the Read output view, without the line-number prefix. Use LF for pure CRLF files; use actual \\r escapes where Read shows \\r.",
    }),
    new_string: Type.String({
      description:
        "Replacement text in the same Read output view. LF is written back as CRLF only for pure CRLF files.",
    }),
    replace_all: Type.Optional(
      Type.Boolean({
        description:
          "Set true only when every occurrence of old_string should be replaced.",
      }),
    ),
  },
  { additionalProperties: false },
);

export interface KimiEditInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface KimiEditDetails {
  replacementCount: number;
  diff: string;
}

type LineEndingStyle = "lf" | "crlf" | "mixed";

interface ModelTextView {
  text: string;
  lineEndingStyle: LineEndingStyle;
}

function resolveEditPath(path: string, cwd: string): string {
  if (path === "~") return process.env.HOME ?? path;
  if (path.startsWith("~/")) {
    const home = process.env.HOME;
    if (home) return resolve(home, path.slice(2));
  }
  if (isAbsolute(path)) return path;

  const cwdAbs = resolve(cwd);
  const resolved = resolve(cwdAbs, path);
  const rel = relative(cwdAbs, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `Relative edit path escapes the working directory: ${path}. Use an absolute path for files outside the working directory.`,
    );
  }
  return resolved;
}

function detectLineEndingStyle(text: string): LineEndingStyle {
  let hasCrLf = false;
  let hasLf = false;
  let hasLoneCr = false;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        hasCrLf = true;
        i++;
      } else {
        hasLoneCr = true;
      }
    } else if (code === 10) {
      hasLf = true;
    }
  }

  if (hasLoneCr || (hasCrLf && hasLf)) return "mixed";
  if (hasCrLf) return "crlf";
  return "lf";
}

function toModelTextView(raw: string): ModelTextView {
  const lineEndingStyle = detectLineEndingStyle(raw);
  if (lineEndingStyle !== "crlf") return { text: raw, lineEndingStyle };
  return { text: raw.replaceAll("\r\n", "\n"), lineEndingStyle };
}

function materializeModelText(text: string, lineEndingStyle: LineEndingStyle) {
  if (lineEndingStyle !== "crlf") return text;
  return text.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while (pos < content.length) {
    const idx = content.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + needle.length;
  }
  return count;
}

function replaceOnce(
  content: string,
  oldString: string,
  newString: string,
): string {
  const index = content.indexOf(oldString);
  if (index === -1) return content;
  return (
    content.slice(0, index) +
    newString +
    content.slice(index + oldString.length)
  );
}

export async function applyKimiEdit(
  args: KimiEditInput,
  cwd: string,
  signal?: AbortSignal,
): Promise<{
  oldContent: string;
  newContent: string;
  replacementCount: number;
}> {
  if (args.old_string.length === 0) {
    throw new Error("old_string must not be empty.");
  }
  if (args.old_string === args.new_string) {
    throw new Error(
      "No changes to make: old_string and new_string are exactly the same.",
    );
  }

  const absolutePath = resolveEditPath(args.path, cwd);
  return withFileMutationQueue(absolutePath, async () => {
    signal?.throwIfAborted();
    const raw = await readFile(absolutePath, "utf8");
    signal?.throwIfAborted();
    const modelView = toModelTextView(raw);
    const replaceAll = args.replace_all ?? false;
    const occurrences = countOccurrences(modelView.text, args.old_string);

    if (occurrences === 0) {
      throw new Error(
        `old_string not found in ${args.path}, the file contents may be out of date. Please use the read tool to reload the content.`,
      );
    }

    if (!replaceAll && occurrences > 1) {
      throw new Error(
        `old_string is not unique in ${args.path} (found ${occurrences} occurrences). To replace every occurrence, set replace_all=true. To replace only one occurrence, include more surrounding context in old_string.`,
      );
    }

    const next = replaceAll
      ? modelView.text.split(args.old_string).join(args.new_string)
      : replaceOnce(modelView.text, args.old_string, args.new_string);

    signal?.throwIfAborted();
    await writeFile(
      absolutePath,
      materializeModelText(next, modelView.lineEndingStyle),
      "utf8",
    );
    if (signal?.aborted) {
      throw new Error(
        `Operation aborted after editing ${args.path}. The file was modified; re-read it before retrying.`,
      );
    }
    return {
      oldContent: modelView.text,
      newContent: next,
      replacementCount: replaceAll ? occurrences : 1,
    };
  });
}

export function createKimiEditToolDefinition(
  cwd: string,
): ToolDefinition<
  typeof KIMI_EDIT_SCHEMA,
  KimiEditDetails | undefined,
  KimiEditRenderState
> {
  return {
    name: "edit",
    label: "edit",
    description: KIMI_EDIT_DESCRIPTION,
    promptSnippet:
      "Perform exact replacements in existing files with old_string/new_string",
    promptGuidelines: KIMI_EDIT_GUIDELINES,
    parameters: KIMI_EDIT_SCHEMA,
    outputSchema: EditOutputSchema,
    annotations: EDIT_ANNOTATIONS,
    renderShell: "default",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const workdir = ctx?.cwd ?? cwd;
      const result = await applyKimiEdit(
        params as KimiEditInput,
        workdir,
        signal,
      );
      const { diff, firstChangedLine } = generateDiffString(
        result.oldContent,
        result.newContent,
      );
      return {
        content: [
          {
            type: "text",
            text: `Replaced ${result.replacementCount} occurrence${result.replacementCount === 1 ? "" : "s"} in ${(params as KimiEditInput).path}.`,
          },
        ],
        details: { replacementCount: result.replacementCount, diff },
        structuredContent: buildEditOutput(
          (params as KimiEditInput).path,
          result.replacementCount,
          firstChangedLine,
        ),
      };
    },
    renderCall: renderKimiEditCall,
    renderResult: renderKimiEditResult,
  };
}
