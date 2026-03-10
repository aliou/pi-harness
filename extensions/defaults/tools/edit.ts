import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type {
  EditToolDetails,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  applyEdits,
  type EditOp,
  generateDiff,
  parseTarget,
  readFileLines,
  validateTags,
} from "../lib/hashline";

/**
 * Override the built-in edit tool with hashline-based editing.
 *
 * Instead of exact text matching, this tool uses LINE#HASH tags from read output
 * to identify lines. This eliminates whitespace/exact-match errors and enables
 * multiple edits per call.
 */
export function setupEditTool(pi: ExtensionAPI): void {
  const editSchema = Type.Object({
    path: Type.String({ description: "Path to the file to edit" }),
    edits: Type.Array(
      Type.Object({
        op: StringEnum([
          "replace",
          "insert_after",
          "insert_before",
          "delete",
        ] as const),
        target: Type.String({
          description: "Line tag '5#KT' or range '5#KT-8#VR'",
        }),
        content: Type.Optional(
          Type.Array(Type.String(), {
            description:
              "New lines. Required for replace/insert_after/insert_before. Omit for delete.",
          }),
        ),
      }),
      {
        description:
          "Edit operations using LINE#HASH tags from read output. Applied bottom-up.",
      },
    ),
  });

  pi.registerTool({
    name: "edit",
    label: "Edit File",
    description:
      "Edit a file using LINE#HASH tags from read output. Supports multiple operations per call.",
    parameters: editSchema,
    // TODO: promptGuidelines not recognized by current pi-coding-agent types
    // promptGuidelines: [
    //   "Reference lines using LINE#HASH tags from read output.",
    //   "Multiple edits per call. They are applied bottom-up (highest line first).",
    //   "Operations: replace (single line or range), insert_after (single line only), insert_before (single line only), delete (single line or range).",
    //   "For ranges: '5#KT-8#VR' covers lines 5 through 8 inclusive.",
    //   "If tags are stale, the error shows updated tags. Retry with those.",
    //   "Use edit instead of sed for in-place file edits.",
    // ],
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { path, edits } = params as {
        path: string;
        edits: Array<{
          op: "replace" | "insert_after" | "insert_before" | "delete";
          target: string;
          content?: string[];
        }>;
      };

      const absolutePath = resolve(ctx.cwd, path);

      // Read current file content
      let fileLines: string[];
      try {
        fileLines = await readFileLines(absolutePath);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }

      // Validate all tags
      const validation = await validateTags(
        fileLines,
        edits.map((e) => ({ target: e.target, op: e.op })),
      );
      if (!validation.valid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Tag validation failed: ${validation.error}\n\n${validation.context ?? ""}\n\nCorrected tag: ${validation.correctedTags ?? "N/A"}`,
            },
          ],
          details: {},
        };
      }

      // Parse targets into EditOps
      const editOps: EditOp[] = [];
      for (const edit of edits) {
        const parsed = parseTarget(edit.target);
        if (!parsed) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid target format: ${edit.target}`,
              },
            ],
            details: {},
          };
        }

        // Validate that insert operations use single-line targets
        if (
          (edit.op === "insert_after" || edit.op === "insert_before") &&
          parsed.start.line !== parsed.end.line
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Insert operations require a single-line target, got range: ${edit.target}`,
              },
            ],
            details: {},
          };
        }

        // Validate content is provided for non-delete operations
        if (edit.op !== "delete" && !edit.content) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Operation '${edit.op}' requires content`,
              },
            ],
            details: {},
          };
        }

        editOps.push({
          op: edit.op,
          target: parsed,
          content: edit.content,
        });
      }

      // Apply edits
      const newLines = applyEdits(fileLines, editOps);

      // Write the file
      try {
        await writeFile(absolutePath, `${newLines.join("\n")}\n`, "utf-8");
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }

      // Generate diff for TUI rendering
      const { diff, firstChangedLine } = generateDiff(
        fileLines,
        newLines,
        path,
      );

      const details: EditToolDetails = {
        diff,
        firstChangedLine,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully applied ${edits.length} edit(s) to ${path}.`,
          },
        ],
        details,
      };
    },
  });
}
