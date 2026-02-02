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

const ActionParams = Type.Object({
  app: Type.String({ description: "App name or bundle id" }),
  locator: Locator,
  action: Type.String({
    description: "Accessibility action (e.g., AXPress, AXScrollToVisible)",
  }),
  value: Type.Optional(Type.String({ description: "Action value" })),
  maxDepth: Type.Optional(
    Type.Number({ description: "Max traversal depth (default: 10)" }),
  ),
});

type ActionParamsType = Static<typeof ActionParams>;

interface ActionDetails {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

type ExecuteResult = AgentToolResult<ActionDetails>;

function buildActionPayload(
  app: string,
  locator: LocatorType,
  action: string,
  value: string | undefined,
  maxDepth?: number,
) {
  return {
    command: "performAction",
    application: app,
    locator: buildLocator(locator.criteria, locator.matchAll),
    action,
    action_value: value,
    max_depth: maxDepth,
  };
}

export function setupMacAppActionTool(pi: ExtensionAPI) {
  pi.registerTool<typeof ActionParams, ActionDetails>({
    name: "mac_app_action",
    label: "Mac App Action",
    description: "Run a custom Accessibility action on a macOS UI element.",
    parameters: ActionParams,

    async execute(
      _toolCallId: string,
      params: ActionParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const payload = buildActionPayload(
          params.app,
          params.locator,
          params.action,
          params.value,
          params.maxDepth,
        );
        const result = await runAxorc(payload, ctx, signal);

        if (result.exitCode !== 0) {
          const message =
            result.stderr || result.stdout || "axorc action failed";
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

        const message = "Action completed";
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
            ? `Error running action: ${error.message}`
            : "Error running action.";
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(args: ActionParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("mac_app_action"));
      const app = theme.fg("accent", args.app);
      const action = theme.fg("muted", args.action);
      return new Text(`${label} ${app} ${action}`, 0, 0);
    },

    renderResult(
      result: AgentToolResult<ActionDetails>,
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

      return new Text(theme.fg("success", "✓ Action completed"), 0, 0);
    },
  });
}
