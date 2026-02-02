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

const VersionParams = Type.Object({});
type VersionParamsType = Record<string, never>;

interface VersionDetails {
  success: boolean;
  message: string;
  version?: string;
  installPath?: string;
}

type ExecuteResult = AgentToolResult<VersionDetails>;

export function setupVersionTool(pi: ExtensionAPI) {
  pi.registerTool<typeof VersionParams, VersionDetails>({
    name: "pi_version",
    label: "Pi Version",
    description: "Get the version of the currently running Pi instance",

    parameters: VersionParams,

    async execute(
      _toolCallId: string,
      _params: VersionParamsType,
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

        const packageJsonPath = path.join(piPath, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
          return {
            content: [
              {
                type: "text",
                text: `Found Pi installation at ${piPath} but package.json not found`,
              },
            ],
            details: {
              success: false,
              message: `Found Pi installation at ${piPath} but package.json not found`,
              installPath: piPath,
            },
          };
        }

        const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(packageJsonContent);

        const message = `Pi version ${packageJson.version} (running from ${piPath})`;

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message,
            version: packageJson.version,
            installPath: piPath,
          },
        };
      } catch (error) {
        const message = `Error reading Pi version: ${error instanceof Error ? error.message : String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: {
            success: false,
            message,
          },
        };
      }
    },

    renderCall(_args: VersionParamsType, theme: Theme): Text {
      return new Text(theme.fg("toolTitle", theme.bold("pi_version")), 0, 0);
    },

    renderResult(
      result: AgentToolResult<VersionDetails>,
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
      lines.push(theme.fg("success", "✓ Pi Version"));
      lines.push("");
      if (details.version) {
        lines.push(theme.fg("accent", `Version: ${details.version}`));
      }
      if (details.installPath) {
        lines.push(theme.fg("dim", `Path: ${details.installPath}`));
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
