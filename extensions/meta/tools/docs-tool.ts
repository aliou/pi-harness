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

interface DocPaths {
  mainDocs?: string;
  additionalDocs?: string;
  examples?: string;
}

interface DocsDetails {
  success: boolean;
  message: string;
  docPaths?: DocPaths;
  installPath?: string;
}

type ExecuteResult = AgentToolResult<DocsDetails>;

export function setupDocsTool(pi: ExtensionAPI) {
  pi.registerTool<typeof DocsParams, DocsDetails>({
    name: "pi_docs",
    label: "Pi Documentation",
    description:
      "Get paths to Pi documentation files (README.md, docs/, examples/)",

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

        const docPaths = {
          mainDocs: path.join(piPath, "README.md"),
          additionalDocs: path.join(piPath, "docs"),
          examples: path.join(piPath, "examples"),
        };

        // Verify paths exist
        const existingPaths: DocPaths = {};
        let foundCount = 0;

        if (fs.existsSync(docPaths.mainDocs)) {
          existingPaths.mainDocs = docPaths.mainDocs;
          foundCount++;
        }

        if (fs.existsSync(docPaths.additionalDocs)) {
          existingPaths.additionalDocs = docPaths.additionalDocs;
          foundCount++;
        }

        if (fs.existsSync(docPaths.examples)) {
          existingPaths.examples = docPaths.examples;
          foundCount++;
        }

        if (foundCount === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No documentation paths found in Pi installation at ${piPath}`,
              },
            ],
            details: {
              success: false,
              message: `No documentation paths found in Pi installation at ${piPath}`,
              installPath: piPath,
            },
          };
        }

        let message = `Found ${foundCount} documentation paths in Pi installation at ${piPath}`;
        const paths = Object.values(existingPaths);
        message += `\n\nDocumentation paths:\n${paths.map((p) => `- ${p}`).join("\n")}`;

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message: `Found ${foundCount} documentation paths in Pi installation at ${piPath}`,
            docPaths: existingPaths,
            installPath: piPath,
          },
        };
      } catch (error) {
        const message = `Error reading Pi documentation paths: ${error instanceof Error ? error.message : String(error)}`;
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
      lines.push(theme.fg("success", `✓ ${details.message}`));
      lines.push("");

      if (details.docPaths?.mainDocs) {
        lines.push(
          theme.fg("accent", "Main documentation: ") +
            details.docPaths.mainDocs,
        );
      }
      if (details.docPaths?.additionalDocs) {
        lines.push(
          theme.fg("accent", "Additional docs: ") +
            details.docPaths.additionalDocs,
        );
      }
      if (details.docPaths?.examples) {
        lines.push(
          theme.fg("accent", "Examples: ") + details.docPaths.examples,
        );
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
