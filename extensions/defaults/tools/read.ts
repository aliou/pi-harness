import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLsTool, createReadTool } from "@mariozechner/pi-coding-agent";

/**
 * Override the built-in read tool to handle directories.
 *
 * If the path is a directory, delegate to the native `ls` tool instead of
 * throwing EISDIR.
 */
export function setupReadTool(pi: ExtensionAPI): void {
  const cwd = process.cwd();

  const nativeRead = createReadTool(cwd);
  const nativeLs = createLsTool(cwd);

  pi.registerTool({
    ...nativeRead,
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
          // Warn user that read was called on a directory (temporary, for monitoring)
          ctx.ui.notify(`read called on directory: ${path}`, "info");

          // Delegate to native ls when reading a directory
          return nativeLs.execute(toolCallId, { path }, signal, onUpdate);
        }
      } catch {
        // Path does not exist or cannot be accessed - let nativeRead handle the error
      }

      // Fall back to native read behavior for files (or let it error naturally)
      return nativeRead.execute(
        toolCallId,
        params as { path: string; offset?: number; limit?: number },
        signal,
        onUpdate,
      );
    },
  });
}
