import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { renderInfoBoxLines } from "../components/info-box";
import { TextViewer } from "../components/text-viewer";

// ---------------------------------------------------------------------------
// Content builder
// ---------------------------------------------------------------------------

function buildContent(
  allTools: Array<{ name: string; description: string }>,
  activeToolNames: string[],
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const activeSet = new Set(activeToolNames);

  if (allTools.length === 0) {
    lines.push("No tools available");
    return lines;
  }

  const activeTools = allTools.filter((t) => activeSet.has(t.name));
  const inactiveTools = allTools.filter((t) => !activeSet.has(t.name));

  // Active tools
  lines.push(
    theme.fg("accent", theme.bold(`Active Tools (${activeTools.length})`)),
  );
  lines.push("");

  const innerWidth = Math.max(1, width - 4);

  for (const tool of activeTools) {
    const bodyLines = tool.description
      ? wrapTextWithAnsi(tool.description, innerWidth)
      : [];
    lines.push(...renderInfoBoxLines(tool.name, bodyLines, width, theme));
    lines.push("");
  }

  // Inactive tools
  if (inactiveTools.length > 0) {
    lines.push(
      theme.fg("dim", theme.bold(`Inactive Tools (${inactiveTools.length})`)),
    );
    lines.push("");

    for (const tool of inactiveTools) {
      const bodyLines = tool.description
        ? wrapTextWithAnsi(theme.fg("dim", tool.description), innerWidth)
        : [];
      const title = theme.fg("dim", tool.name);
      lines.push(...renderInfoBoxLines(title, bodyLines, width, theme));
      lines.push("");
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerToolsCommand(pi: ExtensionAPI) {
  pi.registerCommand("pi:tools", {
    description: "View all available tools and their status",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const allTools = pi.getAllTools();
      const activeToolNames = pi.getActiveTools();

      await ctx.ui.custom((tui, theme, _keybindings, done) => {
        return new TextViewer(
          "Available Tools",
          (width, t) => buildContent(allTools, activeToolNames, width, t),
          tui,
          theme,
          () => done(undefined),
        );
      });
    },
  });
}
