import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { findPiInstallation } from "./utils";

const DocsParams = Type.Object({});
type DocsParamsType = Record<string, never>;

interface DocsDetails {
  success: boolean;
  message: string;
  readme?: string;
  docFiles?: string[];
  examplesDir?: string;
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
      "List all Pi documentation files (README, docs/, examples/) with their full paths",

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

        const lines: string[] = [];
        const docFiles: string[] = [];

        // README
        const hasReadme = fs.existsSync(readmePath);
        if (hasReadme) {
          lines.push(`README: ${readmePath}`);
        }

        // List all files in docs/
        if (fs.existsSync(docsDir)) {
          const files = listFilesRecursive(docsDir);
          lines.push("");
          lines.push(`Documentation files (${docsDir}):`);
          for (const file of files) {
            const fullPath = path.join(docsDir, file);
            docFiles.push(fullPath);
            lines.push(`  ${file}`);
          }
        }

        // Examples directory
        const hasExamples = fs.existsSync(examplesDir);
        if (hasExamples) {
          lines.push("");
          lines.push(`Examples: ${examplesDir}`);
        }

        if (!hasReadme && docFiles.length === 0 && !hasExamples) {
          return {
            content: [
              {
                type: "text",
                text: `No documentation found in Pi installation at ${piPath}`,
              },
            ],
            details: {
              success: false,
              message: `No documentation found in Pi installation at ${piPath}`,
              installPath: piPath,
            },
          };
        }

        const message = lines.join("\n");

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message,
            readme: hasReadme ? readmePath : undefined,
            docFiles: docFiles.length > 0 ? docFiles : undefined,
            examplesDir: hasExamples ? examplesDir : undefined,
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
      _options: ToolRenderResultOptions,
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

      const lines: string[] = [];

      if (details.readme) {
        lines.push(`${theme.fg("accent", "README:")} ${details.readme}`);
      }

      if (details.docFiles && details.docFiles.length > 0) {
        lines.push("");
        lines.push(
          theme.fg("accent", `Docs (${details.docFiles.length} files):`),
        );
        for (const file of details.docFiles) {
          lines.push(theme.fg("dim", `  ${file}`));
        }
      }

      if (details.examplesDir) {
        lines.push("");
        lines.push(`${theme.fg("accent", "Examples:")} ${details.examplesDir}`);
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
