import type {
  ExtensionAPI,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { SocketClient } from "../bridge/socket-client";
import type { BrowserRpcMethod } from "../bridge/types";

type ToolParams = Record<string, unknown>;

function renderResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function createTool(
  name: string,
  label: string,
  description: string,
  parameters: ReturnType<typeof Type.Object>,
  method: BrowserRpcMethod,
): (client: SocketClient) => ToolDefinition {
  return (client) => ({
    name,
    label,
    description,
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const response = await client.request(
        method,
        (params ?? {}) as ToolParams,
        signal,
      );
      if (!response.ok) {
        throw new Error(response.error ?? `Tool ${name} failed`);
      }

      return {
        content: [
          { type: "text", text: renderResult(response.result ?? null) },
        ],
        details: response.result,
      };
    },
  });
}

export function registerDebugTools(
  pi: ExtensionAPI,
  client: SocketClient,
): void {
  pi.registerTool(
    createTool(
      "browser_read_console",
      "Read Console",
      "Read captured console messages from a tab. Attaches debugger on first use.",
      Type.Object({
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
        level: Type.Optional(
          Type.Union([
            Type.Literal("log"),
            Type.Literal("info"),
            Type.Literal("warn"),
            Type.Literal("error"),
            Type.Literal("debug"),
          ]),
        ),
        pattern: Type.Optional(
          Type.String({ description: "Case-insensitive text filter." }),
        ),
      }),
      "debug.read_console_messages",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_read_network",
      "Read Network",
      "Read captured network requests from a tab. Response bodies are summarized (type/length/JSON keys).",
      Type.Object({
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
        method: Type.Optional(
          Type.String({ description: "HTTP method filter (GET, POST, ...)." }),
        ),
        urlPattern: Type.Optional(
          Type.String({
            description: "Case-insensitive URL substring filter.",
          }),
        ),
      }),
      "debug.read_network_requests",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_download_network",
      "Download Network",
      "Download captured requests and full responses as JSON file.",
      Type.Object({
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
        method: Type.Optional(
          Type.String({ description: "Optional HTTP method filter." }),
        ),
        urlPattern: Type.Optional(
          Type.String({ description: "Optional URL substring filter." }),
        ),
        filename: Type.Optional(
          Type.String({
            description: "Download path/name, e.g. Downloads/api-log.json",
          }),
        ),
      }),
      "debug.export_network_requests",
    )(client),
  );
}
