import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLsTool, createReadTool } from "@mariozechner/pi-coding-agent";
import { addHashlineTags } from "../lib/hashline";

/**
 * Override the built-in read tool to:
 * 1. Handle directories (delegate to ls)
 * 2. Add LINE#HASH tags to file content for use with the edit tool
 */
export function setupReadTool(pi: ExtensionAPI): void {
  const cwd = process.cwd();

  const nativeRead = createReadTool(cwd);
  const nativeLs = createLsTool(cwd);

  pi.registerTool({
    ...nativeRead,
    description:
      "Read file contents. Each line is tagged with LINE#HASH for use with the edit tool.",
    // TODO: promptGuidelines not recognized by current pi-coding-agent types
    // promptGuidelines: [
    //   "read output uses LINE#HASH tags. Use these tags when editing with the edit tool.",
    //   "Use read instead of cat, head, or tail in bash.",
    // ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { path } = params as {
        path: string;
        offset?: number;
        limit?: number;
      };

      // Resolve path relative to extension context's working directory
      const absolutePath = resolve(ctx.cwd, path);

      try {
        const stat = await lstat(absolutePath);

        if (stat.isDirectory()) {
          // Delegate to native ls when reading a directory
          return nativeLs.execute(toolCallId, { path }, signal, onUpdate);
        }
      } catch {
        // Path does not exist or cannot be accessed - let nativeRead handle the error
      }

      // Execute native read
      const result = await nativeRead.execute(
        toolCallId,
        params as { path: string; offset?: number; limit?: number },
        signal,
        onUpdate,
      );

      // Find text content block and add hashline tags
      const textBlock = result.content.find((c) => c.type === "text");
      if (textBlock && textBlock.type === "text") {
        const startLine = (params as { offset?: number }).offset ?? 1;
        textBlock.text = await addHashlineTags(textBlock.text, startLine);
      }
      // Image blocks pass through unchanged

      return result;
    },
  });
}
