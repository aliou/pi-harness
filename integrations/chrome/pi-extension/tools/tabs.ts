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

export function registerTabTools(pi: ExtensionAPI, client: SocketClient): void {
  pi.registerTool(
    createTool(
      "browser_tabs_list",
      "List Tabs",
      "List all open browser tabs with IDs, titles, URLs, active flag, and window IDs.",
      Type.Object({}),
      "tabs.list",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_tabs_create",
      "Create Tab",
      "Create a new browser tab. Optionally provide a URL.",
      Type.Object({
        url: Type.Optional(
          Type.String({ description: "URL to open in the new tab." }),
        ),
      }),
      "tabs.create",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_tabs_activate",
      "Activate Tab",
      "Activate a browser tab by tab ID.",
      Type.Object({
        tabId: Type.Number({ description: "Numeric tab ID to activate." }),
      }),
      "tabs.activate",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_tabs_close",
      "Close Tab",
      "Close a browser tab by tab ID.",
      Type.Object({
        tabId: Type.Number({ description: "Numeric tab ID to close." }),
      }),
      "tabs.close",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_navigate",
      "Navigate",
      "Navigate a tab to a URL. If tabId is omitted, current tab is used.",
      Type.Object({
        url: Type.String({ description: "Destination URL." }),
        tabId: Type.Optional(
          Type.Number({ description: "Target tab ID (optional)." }),
        ),
      }),
      "tabs.update",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_go_back",
      "Go Back",
      "Go back in tab history. If tabId is omitted, current tab is used.",
      Type.Object({
        tabId: Type.Optional(
          Type.Number({ description: "Target tab ID (optional)." }),
        ),
      }),
      "tabs.go_back",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_go_forward",
      "Go Forward",
      "Go forward in tab history. If tabId is omitted, current tab is used.",
      Type.Object({
        tabId: Type.Optional(
          Type.Number({ description: "Target tab ID (optional)." }),
        ),
      }),
      "tabs.go_forward",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_reload",
      "Reload Tab",
      "Reload a tab. If tabId is omitted, current tab is used.",
      Type.Object({
        tabId: Type.Optional(
          Type.Number({ description: "Target tab ID (optional)." }),
        ),
      }),
      "tabs.reload",
    )(client),
  );
}
