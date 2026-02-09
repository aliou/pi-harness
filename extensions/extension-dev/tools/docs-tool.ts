import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { findPiInstallation } from "./utils";

const DocsParams = Type.Object({});
type DocsParamsType = Record<string, never>;

interface DocsDetails {
  success: boolean;
  message: string;
  /** Relative paths from the pi install root, markdown only. */
  docFiles?: string[];
  installPath?: string;
}

type ExecuteResult = AgentToolResult<DocsDetails>;

function listFilesRecursive(dir: string, prefix = ""): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(path.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

export function setupDocsTool(pi: ExtensionAPI) {
  pi.registerTool<typeof DocsParams, DocsDetails>({
    name: "pi_docs",
    label: "Pi Documentation",
    description:
      "List Pi markdown documentation files (README, docs/, examples/)",

    parameters: DocsParams,

    async execute(
      _toolCallId: string,
      _params: DocsParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const piPath = findPiInstallation();
        if (!piPath) {
          return {
            content: [
              {
                type: "text",
                text: "Could not locate running Pi installation directory",
              },
            ],
            details: {
              success: false,
              message: "Could not locate running Pi installation directory",
            },
          };
        }

        const readmePath = path.join(piPath, "README.md");
        const docsDir = path.join(piPath, "docs");
        const examplesDir = path.join(piPath, "examples");

        const docFiles: string[] = [];

        if (fs.existsSync(readmePath)) {
          docFiles.push("README.md");
        }

        if (fs.existsSync(docsDir)) {
          for (const file of listFilesRecursive(docsDir)) {
            if (file.endsWith(".md")) {
              docFiles.push(`docs/${file}`);
            }
          }
        }

        if (fs.existsSync(examplesDir)) {
          for (const file of listFilesRecursive(examplesDir)) {
            if (file.endsWith(".md")) {
              docFiles.push(`examples/${file}`);
            }
          }
        }

        if (docFiles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No markdown documentation found in Pi installation`,
              },
            ],
            details: {
              success: false,
              message: `No markdown documentation found in Pi installation`,
              installPath: piPath,
            },
          };
        }

        // Content sent to LLM: full relative paths so it can read them.
        const lines = docFiles.map(
          (rel) => `${path.join(piPath, rel)} (${rel})`,
        );
        const message = `${docFiles.length} markdown files:\n${lines.join("\n")}`;

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message: `Found ${docFiles.length} markdown files`,
            docFiles,
            installPath: piPath,
          },
        };
      } catch (error) {
        const message = `Error reading Pi documentation: ${error instanceof Error ? error.message : String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: {
            success: false,
            message,
          },
        };
      }
    },

    renderCall(_args: DocsParamsType, theme: Theme): Text {
      return new Text(theme.fg("toolTitle", theme.bold("pi_docs")), 0, 0);
    },

    renderResult(
      result: AgentToolResult<DocsDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ): Text {
      const { details } = result;

      if (!details) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" && text.text ? text.text : "No result",
          0,
          0,
        );
      }

      if (!details.success) {
        return new Text(theme.fg("error", `✗ ${details.message}`), 0, 0);
      }

      if (!details.docFiles || details.docFiles.length === 0) {
        return new Text(theme.fg("warning", "No docs found"), 0, 0);
      }

      const { expanded } = options;
      const lines: string[] = [];

      if (expanded) {
        // Expanded: show relative paths
        lines.push(
          theme.fg("accent", `${details.docFiles.length} markdown files:`),
        );
        lines.push("");
        for (const rel of details.docFiles) {
          lines.push(theme.fg("dim", `  ${rel}`));
        }
      } else {
        // Collapsed: count + grid of filenames
        lines.push(
          theme.fg("accent", `${details.docFiles.length} markdown files`) +
            ` (${keyHint("expandTools", "to expand")})`,
        );
        lines.push("");
        const filenames = details.docFiles.map((p) => path.basename(p));
        const maxLen = Math.max(...filenames.map((f) => f.length));
        const colWidth = maxLen + 2;
        const cols = Math.max(1, Math.floor(80 / colWidth));
        for (let i = 0; i < filenames.length; i += cols) {
          const row = filenames
            .slice(i, i + cols)
            .map((f) => f.padEnd(colWidth))
            .join("");
          lines.push(theme.fg("dim", row));
        }
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
