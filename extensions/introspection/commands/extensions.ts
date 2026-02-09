import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { TextViewer } from "../components/text-viewer";

// ---------------------------------------------------------------------------
// Content builder
// ---------------------------------------------------------------------------

function buildContent(_width: number, theme: Theme): string[] {
  const lines: string[] = [];

  lines.push(theme.fg("accent", theme.bold("Extensions")));
  lines.push("");
  lines.push(theme.fg("dim", "Extension listing not yet fully implemented."));
  lines.push(theme.fg("dim", "Use /i:commands to see all available commands."));

  return lines;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerExtensionsCommand(pi: ExtensionAPI) {
  pi.registerCommand("pi:extensions", {
    description: "View registered extensions (limited view)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const result = await ctx.ui.custom((tui, theme, _keybindings, done) => {
        return new TextViewer(
          "Extensions",
          (width, t) => buildContent(width, t),
          tui,
          theme,
          () => done(undefined),
        );
      });

      // RPC fallback
      if (result === undefined) {
        ctx.ui.notify("/i:extensions requires interactive mode", "info");
      }
    },
  });
}
