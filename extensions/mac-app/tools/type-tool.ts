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

const TypeParams = Type.Object({
  app: Type.String({ description: "App name or bundle id" }),
  locator: Locator,
  value: Type.String({ description: "Text to set" }),
  maxDepth: Type.Optional(
    Type.Number({ description: "Max traversal depth (default: 10)" }),
  ),
});

type TypeParamsType = Static<typeof TypeParams>;

interface TypeDetails {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

type ExecuteResult = AgentToolResult<TypeDetails>;

function buildTypePayload(
  app: string,
  locator: LocatorType,
  value: string,
  maxDepth?: number,
) {
  return {
    command: "performAction",
    application: app,
    locator: buildLocator(locator.criteria, locator.matchAll),
    action: "AXSetValue",
    action_value: value,
    max_depth: maxDepth,
  };
}

export function setupMacAppTypeTool(pi: ExtensionAPI) {
  pi.registerTool<typeof TypeParams, TypeDetails>({
    name: "mac_app_type",
    label: "Mac App Type",
    description: "Set a value on a macOS UI element via Accessibility.",
    parameters: TypeParams,

    async execute(
      _toolCallId: string,
      params: TypeParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const payload = buildTypePayload(
          params.app,
          params.locator,
          params.value,
          params.maxDepth,
        );
        const result = await runAxorc(payload, ctx, signal);

        if (result.exitCode !== 0) {
          const message = result.stderr || result.stdout || "axorc type failed";
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

        const message = "Type completed";
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
            ? `Error running type: ${error.message}`
            : "Error running type.";
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(args: TypeParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("mac_app_type"));
      const app = theme.fg("accent", args.app);
      return new Text(`${label} ${app}`, 0, 0);
    },

    renderResult(
      result: AgentToolResult<TypeDetails>,
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

      return new Text(theme.fg("success", "✓ Type completed"), 0, 0);
    },
  });
}
