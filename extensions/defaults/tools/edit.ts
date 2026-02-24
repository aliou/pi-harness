import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Override the built-in edit tool to accept `new_text` as an alias for `newText`.
 *
 * Models sometimes emit `new_text` instead of `newText`, causing a validation
 * error because `newText` is required. This wrapper makes `newText` optional in
 * the schema but normalises `new_text` -> `newText` before delegating to the
 * native implementation. If neither is provided, it returns an error.
 */
export function setupEditTool(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const nativeEdit = createEditTool(cwd);

  const wrappedSchema = Type.Object({
    path: Type.String({ description: "Path to the file to edit" }),
    oldText: Type.String({
      description: "Exact text to find and replace (must match exactly)",
    }),
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
      const { new_text, newText, ...rest } = params as {
        path: string;
        oldText: string;
        newText?: string;
        new_text?: string;
      };

      const resolvedNewText = newText ?? new_text;

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

      return nativeEdit.execute(
        toolCallId,
        { ...rest, newText: resolvedNewText },
        signal,
        onUpdate,
      );
    },
  });
}
