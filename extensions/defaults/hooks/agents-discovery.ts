/**
 * Agents Discovery Hook
 *
 * Auto-discovers AGENTS.md files in subdirectories when the agent reads files.
 * Pi's built-in discovery only walks up from cwd. This hook fills the gap by
 * sending messages with AGENTS.md files found between cwd and the directory of
 * the file being read.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Box, Markdown, Text } from "@mariozechner/pi-tui";
import type { AgentsDiscoveryManager } from "../lib/agents-discovery";

const AGENTS_DISCOVERY_MESSAGE_TYPE = "agents-discovery";

export interface AgentsDiscoveryDetails {
  path: string;
  content: string;
}

export function setupAgentsDiscoveryHook(
  pi: ExtensionAPI,
  manager: AgentsDiscoveryManager,
) {
  // Register custom message renderer
  pi.registerMessageRenderer<AgentsDiscoveryDetails>(
    AGENTS_DISCOVERY_MESSAGE_TYPE,
    (message, options, theme) => {
      const { details } = message;
      if (!details) return undefined;

      const { expanded } = options;
      const prettyPath = manager.prettyPath(details.path);

      const label = theme.bold(theme.fg("accent", "[AGENTS]"));
      const header = `${label} ${theme.fg("muted", prettyPath)}`;

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(header, 0, 0));

      if (expanded) {
        // Show the markdown content below the header
        box.addChild(new Text("", 0, 0)); // spacer
        const mdTheme = getMarkdownTheme();
        const markdown = new Markdown(details.content, 0, 0, mdTheme);
        box.addChild(markdown);
      }

      return box;
    },
  );

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

    const prettyPaths = discovered.map((f) => manager.prettyPath(f.path));

    // Send custom messages for each discovered AGENTS.md
    for (const file of discovered) {
      const wrapped = `Automated AGENTS.md file read\n<agents_md>${file.content}</agents_md>`;
      pi.sendMessage({
        customType: AGENTS_DISCOVERY_MESSAGE_TYPE,
        content: wrapped,
        display: true,
        details: { path: file.path, content: file.content },
      });
    }

    // Notify UI about the discovery
    if (ctx.hasUI) {
      ctx.ui.notify(
        `Loaded subdirectory context: ${prettyPaths.join(", ")}`,
        "info",
      );
    }

    return undefined; // Don't modify the original read result
  });
}
