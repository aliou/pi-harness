/**
 * Agents Discovery Hook
 *
 * Auto-discovers AGENTS.md files in subdirectories when the agent reads files.
 * Pi's built-in discovery only walks up from cwd. This hook fills the gap by
 * injecting AGENTS.md files found between cwd and the directory of the file
 * being read.
 */

import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  AGENTS_DISCOVERY_MESSAGE_TYPE,
  type AgentsDiscoveryDetails,
} from "../components/agents-discovery";
import type { AgentsDiscoveryManager } from "../lib/agents-discovery";

type TextContent = { type: "text"; text: string };

export function setupAgentsDiscoveryHook(
  pi: ExtensionAPI,
  manager: AgentsDiscoveryManager,
) {
  const handleSessionChange = (_event: unknown, ctx: ExtensionContext) => {
    manager.resetSession(ctx.cwd);
  };

  pi.on("session_start", handleSessionChange);
  pi.on("session_switch", handleSessionChange);

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "read" || event.isError) return undefined;

    const pathInput = event.input.path as string | undefined;
    if (!pathInput) return undefined;

    if (!manager.isInitialized) manager.resetSession(ctx.cwd);

    let discovered: Awaited<ReturnType<typeof manager.discover>>;
    try {
      discovered = await manager.discover(pathInput);
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Failed to load subdirectory context: ${String(error)}`,
          "warning",
        );
      }
      return undefined;
    }

    if (!discovered) return undefined;

    const additions: TextContent[] = discovered.map((file) => ({
      type: "text",
      text: `Loaded subdirectory context from ${file.path}\n\n${file.content}`,
    }));

    const relativePaths = discovered.map((f) =>
      path.relative(manager.cwd, f.path),
    );

    pi.sendMessage({
      customType: AGENTS_DISCOVERY_MESSAGE_TYPE,
      content: relativePaths.join(", "),
      display: true,
      details: { files: relativePaths } satisfies AgentsDiscoveryDetails,
    });

    const baseContent = event.content ?? [];
    return { content: [...baseContent, ...additions], details: event.details };
  });
}
