import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import {
  type NvimConnectionState,
  registerNvimContextHook,
} from "./nvim-context";

export type { NvimConnectionState } from "./nvim-context";

export function setupNvimHooks(pi: ExtensionAPI, state: NvimConnectionState) {
  registerNvimContextHook(pi, state);

  // Register custom message renderer for diagnostics - styled like a failed tool call
  pi.registerMessageRenderer("nvim-diagnostics", (message, options, theme) => {
    const { expanded } = options;
    const details = message.details as
      | {
          diagnostics?: Record<
            string,
            Array<{
              line: number;
              col: number;
              message: string;
              source?: string;
            }>
          >;
        }
      | undefined;

    // Create a Box with toolErrorBg background to mimic failed tool call styling
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

    // Header line: tool name + error summary (like a tool call header)
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

    // Detailed errors (always shown, like tool output)
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
      // Show all errors if expanded or if there are few
      box.addChild(new Text(errorText, 0, 0));
    } else {
      // Show truncated with hint to expand
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
