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

const ScrollToParams = Type.Object({
  app: Type.String({ description: "App name or bundle id" }),
  locator: Locator,
  maxDepth: Type.Optional(
    Type.Number({ description: "Max traversal depth (default: 10)" }),
  ),
});

type ScrollToParamsType = Static<typeof ScrollToParams>;

interface ScrollToDetails {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

type ExecuteResult = AgentToolResult<ScrollToDetails>;

function buildScrollToPayload(
  app: string,
  locator: LocatorType,
  maxDepth?: number,
) {
  return {
    command: "performAction",
    application: app,
    locator: buildLocator(locator.criteria, locator.matchAll),
    action: "AXScrollToVisible",
    max_depth: maxDepth,
  };
}

export function setupMacAppScrollToTool(pi: ExtensionAPI) {
  pi.registerTool<typeof ScrollToParams, ScrollToDetails>({
    name: "mac_app_scroll_to",
    label: "Mac App Scroll To",
    description: "Scroll an element into view via Accessibility.",
    parameters: ScrollToParams,

    async execute(
      _toolCallId: string,
      params: ScrollToParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const payload = buildScrollToPayload(
          params.app,
          params.locator,
          params.maxDepth,
        );
        const result = await runAxorc(payload, ctx, signal);

        if (result.exitCode !== 0) {
          const message =
            result.stderr || result.stdout || "axorc scroll-to failed";
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

        const message = "Scroll completed";
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
            ? `Error running scroll: ${error.message}`
            : "Error running scroll.";
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(args: ScrollToParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("mac_app_scroll_to"));
      const app = theme.fg("accent", args.app);
      return new Text(`${label} ${app}`, 0, 0);
    },

    renderResult(
      result: AgentToolResult<ScrollToDetails>,
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

      return new Text(theme.fg("success", "✓ Scroll completed"), 0, 0);
    },
  });
}
