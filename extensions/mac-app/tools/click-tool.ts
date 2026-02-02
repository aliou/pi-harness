import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { buildLocator, runAxorc } from "./axorcist";
import { Locator, type LocatorType } from "./axorcist-schema";

const ClickParams = Type.Object({
  app: Type.String({ description: "App name or bundle id" }),
  locator: Locator,
  maxDepth: Type.Optional(
    Type.Number({ description: "Max traversal depth (default: 10)" }),
  ),
});

type ClickParamsType = Static<typeof ClickParams>;

interface ClickDetails {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

type ExecuteResult = AgentToolResult<ClickDetails>;

function buildClickPayload(
  app: string,
  locator: LocatorType,
  maxDepth?: number,
) {
  return {
    command: "performAction",
    application: app,
    locator: buildLocator(locator.criteria, locator.matchAll),
    action: "AXPress",
    max_depth: maxDepth,
  };
}

export function setupMacAppClickTool(pi: ExtensionAPI) {
  pi.registerTool<typeof ClickParams, ClickDetails>({
    name: "mac_app_click",
    label: "Mac App Click",
    description: "Click a macOS UI element via Accessibility.",
    parameters: ClickParams,

    async execute(
      _toolCallId: string,
      params: ClickParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const payload = buildClickPayload(
          params.app,
          params.locator,
          params.maxDepth,
        );
        const result = await runAxorc(payload, ctx, signal);

        if (result.exitCode !== 0) {
          const message =
            result.stderr || result.stdout || "axorc click failed";
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

        const message = "Click completed";
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
            ? `Error running click: ${error.message}`
            : "Error running click.";
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(args: ClickParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("mac_app_click"));
      const app = theme.fg("accent", args.app);
      return new Text(`${label} ${app}`, 0, 0);
    },

    renderResult(
      result: AgentToolResult<ClickDetails>,
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

      return new Text(theme.fg("success", "✓ Click completed"), 0, 0);
    },
  });
}
