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

export function registerPageReadTools(
  pi: ExtensionAPI,
  client: SocketClient,
): void {
  pi.registerTool(
    createTool(
      "browser_page_get_text",
      "Get Page Text",
      "Get visible page text from current tab. Optional tabId targets a specific tab.",
      Type.Object({
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.get_text",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_read",
      "Read Page",
      "Read interactive/important elements and return stable refs for follow-up actions.",
      Type.Object({
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.read",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_find",
      "Find Elements",
      "Find page elements by query text (matches labels/text/placeholders/alt/title/value).",
      Type.Object({
        query: Type.String({ description: "Search query." }),
        limit: Type.Optional(
          Type.Number({ description: "Max results (default 20)." }),
        ),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.find",
    )(client),
  );
}
