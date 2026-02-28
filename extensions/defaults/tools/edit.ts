import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Override the built-in edit tool to accept snake_case aliases.
 *
 * Models sometimes emit `old_text`/`new_text` instead of `oldText`/`newText`.
 * This wrapper accepts both, normalizes to camelCase, then delegates to native.
 *
 */
export function setupEditTool(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const nativeEdit = createEditTool(cwd);

  const wrappedSchema = Type.Object({
    path: Type.String({ description: "Path to the file to edit" }),
    oldText: Type.Optional(
      Type.String({
        description: "Exact text to find and replace (must match exactly)",
      }),
    ),
    old_text: Type.Optional(
      Type.String({
        description:
          "Alias for oldText. Exact text to find and replace (must match exactly)",
      }),
    ),
    newText: Type.Optional(
      Type.String({
        description: "New text to replace the old text with",
      }),
    ),
    new_text: Type.Optional(
      Type.String({
        description:
          "Alias for newText. New text to replace the old text with.",
      }),
    ),
  });

  pi.registerTool({
    ...nativeEdit,
    parameters: wrappedSchema,
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const { old_text, oldText, new_text, newText, path } = params as {
        path: string;
        oldText?: string;
        old_text?: string;
        newText?: string;
        new_text?: string;
      };

      const resolvedOldText = oldText ?? old_text;
      const resolvedNewText = newText ?? new_text;

      if (resolvedOldText === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: 'Error: Either "oldText" or "old_text" must be provided.',
            },
          ],
          details: {},
        };
      }

      if (resolvedNewText === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: 'Error: Either "newText" or "new_text" must be provided.',
            },
          ],
          details: {},
        };
      }

      const normalizedParams = {
        path,
        oldText: resolvedOldText,
        newText: resolvedNewText,
      };

      return nativeEdit.execute(toolCallId, normalizedParams, signal, onUpdate);
    },
  });
}
