import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { runAxorc } from "./axorcist";

const FocusParams = Type.Object({
  app: Type.String({ description: "App name or bundle id" }),
  attributes: Type.Optional(
    Type.Array(Type.String(), {
      description: "AX attributes to return (e.g., AXRole, AXTitle)",
    }),
  ),
  includeChildrenBrief: Type.Optional(
    Type.Boolean({
      description: "Include brief child info (default: false)",
    }),
  ),
});

type FocusParamsType = Static<typeof FocusParams>;

interface FocusDetails {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

type ExecuteResult = AgentToolResult<FocusDetails>;

function buildFocusPayload(app: string, params: FocusParamsType) {
  return {
    command: "getFocusedElement",
    application: app,
    attributes: params.attributes,
    include_children_brief: params.includeChildrenBrief,
  };
}

export function setupMacAppFocusTool(pi: ExtensionAPI) {
  pi.registerTool<typeof FocusParams, FocusDetails>({
    name: "mac_app_focus",
    label: "Mac App Focus",
    description: "Get the focused UI element for a macOS app.",
    parameters: FocusParams,

    async execute(
      _toolCallId: string,
      params: FocusParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const payload = buildFocusPayload(params.app, params);
        const result = await runAxorc(payload, ctx, signal);

        if (result.exitCode !== 0) {
          const message =
            result.stderr || result.stdout || "axorc focus failed";
          return {
            content: [{ type: "text", text: message }],
            details: {
              success: false,
              message,
              stdout: result.stdout,
              stderr: result.stderr,
              result: result.parsed,
            },
          };
        }

        const message = "Focus fetched";
        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message,
            stdout: result.stdout,
            stderr: result.stderr,
            result: result.parsed,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? `Error fetching focus: ${error.message}`
            : "Error fetching focus.";
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(args: FocusParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("mac_app_focus"));
      const app = theme.fg("accent", args.app);
      return new Text(`${label} ${app}`, 0, 0);
    },

    renderResult(
      result: AgentToolResult<FocusDetails>,
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
        return new Text(theme.fg("error", details.message), 0, 0);
      }

      return new Text(theme.fg("success", "✓ Focus fetched"), 0, 0);
    },
  });
}
