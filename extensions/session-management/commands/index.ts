import { writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { showExportOptions } from "../components/export-options";
import { exportToMarkdown, getExportPath } from "../lib/markdown-exporter";
import { copyToClipboard } from "../utils";

export function setupSessionCommands(pi: ExtensionAPI) {
  pi.registerCommand("session:copy-path", {
    description: "Copy the current session file path to clipboard",
    handler: async (_args, ctx) => {
      const sessionPath = ctx.sessionManager.getSessionFile();

      if (!sessionPath) {
        ctx.ui.notify("No session file (ephemeral session)", "warning");
        return;
      }

      copyToClipboard(sessionPath);
      ctx.ui.notify(sessionPath, "info");
    },
  });

  pi.registerCommand("session:export-md", {
    description: "Export current branch to markdown file",
    handler: async (_args, ctx) => {
      const sessionPath = ctx.sessionManager.getSessionFile();
      if (!sessionPath) {
        ctx.ui.notify("No session to export", "warning");
        return;
      }

      if (!ctx.hasUI) {
        ctx.ui.notify("Requires interactive mode", "error");
        return;
      }

      const options = await showExportOptions(ctx);
      if (!options) return;

      const entries = ctx.sessionManager.getBranch();
      const sessionId = ctx.sessionManager.getSessionId();
      const leafId = ctx.sessionManager.getLeafId() ?? sessionId;
      const cwd = ctx.sessionManager.getCwd();

      // Find the earliest entry timestamp for "started" metadata
      const firstEntry = entries[0];
      const startedAt = firstEntry?.timestamp ?? new Date().toISOString();

      const meta = {
        sessionId,
        leafId,
        startedAt,
        exportedAt: new Date().toISOString(),
        cwd,
      };

      const markdown = exportToMarkdown(entries, options, meta);
      const outputPath = getExportPath(cwd, sessionId, leafId);

      writeFileSync(outputPath, markdown, "utf-8");
      copyToClipboard(outputPath);
      ctx.ui.notify(`Exported to ${outputPath}`, "info");
    },
  });
}
