import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const VersionParams = Type.Object({});
type VersionParamsType = Record<string, never>;

interface VersionDetails {
  success: boolean;
  message: string;
  version: string;
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
      const message = `Pi version ${VERSION}`;
      return {
        content: [{ type: "text", text: message }],
        details: {
          success: true,
          message,
          version: VERSION,
        },
      };
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

      return new Text(
        theme.fg("accent", `Pi version: ${details.version}`),
        0,
        0,
      );
    },
  });
}
