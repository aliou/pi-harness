import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

interface DiagnosticEntry {
  line: number;
  col: number;
  message: string;
  source?: string;
}

interface NvimDiagnosticsDetails {
  diagnostics?: Record<string, DiagnosticEntry[]>;
}

export function registerNvimDiagnosticsRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer("nvim-diagnostics", (message, options, theme) => {
    const { expanded } = options;
    const details = message.details as NvimDiagnosticsDetails | undefined;

    const box = new Box(1, 0, (s) => theme.bg("toolErrorBg", s));

    if (!details?.diagnostics) {
      box.addChild(
        new Text(
          theme.fg("toolTitle", theme.bold("nvim_lsp ")) +
            theme.fg("error", "LSP errors detected"),
          0,
          0,
        ),
      );
      return box;
    }

    const errorCount = Object.values(details.diagnostics).reduce(
      (sum, errs) => sum + errs.length,
      0,
    );
    const fileCount = Object.keys(details.diagnostics).length;

    // Header: tool name + error summary
    let header = theme.fg("toolTitle", theme.bold("nvim_lsp "));
    header += theme.fg(
      "error",
      `${errorCount} error${errorCount > 1 ? "s" : ""}`,
    );
    header += theme.fg(
      "dim",
      ` in ${fileCount} file${fileCount > 1 ? "s" : ""}`,
    );
    box.addChild(new Text(header, 0, 0));

    // Detailed errors
    let errorText = "";
    for (const [file, errors] of Object.entries(details.diagnostics)) {
      const filename = file.split("/").pop() ?? file;
      errorText += `\n${theme.fg("accent", filename)}`;
      for (const err of errors) {
        const source = err.source ? theme.fg("dim", ` (${err.source})`) : "";
        errorText += `\n  ${theme.fg("dim", `L${err.line}:${err.col}`)} ${err.message}${source}`;
      }
    }

    if (expanded || errorCount <= 5) {
      box.addChild(new Text(errorText, 0, 0));
    } else {
      const firstFileErrors = Object.entries(details.diagnostics)[0];
      if (firstFileErrors) {
        const [file, errors] = firstFileErrors;
        const filename = file.split("/").pop() ?? file;
        let preview = `\n${theme.fg("accent", filename)}`;
        for (const err of errors.slice(0, 3)) {
          const source = err.source ? theme.fg("dim", ` (${err.source})`) : "";
          preview += `\n  ${theme.fg("dim", `L${err.line}:${err.col}`)} ${err.message}${source}`;
        }
        if (errors.length > 3) {
          preview += theme.fg("dim", `\n  ... and ${errors.length - 3} more`);
        }
        if (fileCount > 1) {
          preview += theme.fg(
            "dim",
            `\n\n... and ${fileCount - 1} more file${fileCount > 2 ? "s" : ""}`,
          );
        }
        preview += theme.fg("dim", "\n\nPress Ctrl+O to expand");
        box.addChild(new Text(preview, 0, 0));
      }
    }

    return box;
  });
}
