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

const QueryParams = Type.Object({
  app: Type.String({ description: "App name or bundle id" }),
  locator: Locator,
  attributes: Type.Optional(
    Type.Array(Type.String(), {
      description: "AX attributes to return (e.g., AXRole, AXTitle)",
    }),
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Max traversal depth (default: 10)" }),
  ),
  includeChildrenBrief: Type.Optional(
    Type.Boolean({
      description: "Include brief child info (default: false)",
    }),
  ),
});

type QueryParamsType = Static<typeof QueryParams>;

interface QueryDetails {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
}

type ExecuteResult = AgentToolResult<QueryDetails>;

function buildQueryPayload(
  app: string,
  locator: LocatorType,
  params: QueryParamsType,
) {
  return {
    command: "query",
    application: app,
    locator: buildLocator(locator.criteria, locator.matchAll),
    attributes: params.attributes,
    max_depth: params.maxDepth,
    include_children_brief: params.includeChildrenBrief,
  };
}

export function setupMacAppQueryTool(pi: ExtensionAPI) {
  pi.registerTool<typeof QueryParams, QueryDetails>({
    name: "mac_app_query",
    label: "Mac App Query",
    description: "Query macOS UI elements via Accessibility.",
    parameters: QueryParams,

    async execute(
      _toolCallId: string,
      params: QueryParamsType,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const payload = buildQueryPayload(params.app, params.locator, params);
        const result = await runAxorc(payload, ctx, signal);

        if (result.exitCode !== 0) {
          const message =
            result.stderr || result.stdout || "axorc query failed";
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

        const message = "Query completed";
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
            ? `Error running query: ${error.message}`
            : "Error running query.";
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(args: QueryParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("mac_app_query"));
      const app = theme.fg("accent", args.app);
      return new Text(`${label} ${app}`, 0, 0);
    },

    renderResult(
      result: AgentToolResult<QueryDetails>,
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

      return new Text(theme.fg("success", "✓ Query completed"), 0, 0);
    },
  });
}
