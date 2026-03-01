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

export function registerPageTools(
  pi: ExtensionAPI,
  client: SocketClient,
): void {
  pi.registerTool(
    createTool(
      "browser_page_click",
      "Page Click",
      "Click an element by ref from browser_page_read/browser_page_find, or by x/y coordinates. Optional tabId targets a specific tab.",
      Type.Object({
        ref: Type.Optional(
          Type.String({ description: "Element ref, e.g. btn-5." }),
        ),
        x: Type.Optional(
          Type.Number({ description: "X coordinate for click fallback." }),
        ),
        y: Type.Optional(
          Type.Number({ description: "Y coordinate for click fallback." }),
        ),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.click",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_type",
      "Page Type",
      "Type text into an editable element. Prefer ref from browser_page_read/browser_page_find.",
      Type.Object({
        text: Type.String({ description: "Text to type." }),
        ref: Type.Optional(
          Type.String({
            description: "Element ref. If omitted, uses focused element.",
          }),
        ),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.type",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_scroll",
      "Page Scroll",
      "Scroll the page or a scrollable element by ref.",
      Type.Object({
        direction: Type.Union([
          Type.Literal("up"),
          Type.Literal("down"),
          Type.Literal("left"),
          Type.Literal("right"),
        ]),
        amount: Type.Optional(
          Type.Number({
            description: "Scroll amount in pixels (default 500).",
          }),
        ),
        ref: Type.Optional(
          Type.String({
            description: "Optional scroll container element ref.",
          }),
        ),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.scroll",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_key",
      "Page Key",
      "Press a key or key combo (Enter, Tab, Escape, Cmd+A, Cmd+Shift+P).",
      Type.Object({
        keys: Type.String({ description: "Key string or combo." }),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.key",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_hover",
      "Page Hover",
      "Hover an element by ref or coordinates.",
      Type.Object({
        ref: Type.Optional(Type.String({ description: "Element ref." })),
        x: Type.Optional(
          Type.Number({ description: "X coordinate fallback." }),
        ),
        y: Type.Optional(
          Type.Number({ description: "Y coordinate fallback." }),
        ),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.hover",
    )(client),
  );

  pi.registerTool(
    createTool(
      "browser_page_form_input",
      "Page Form Input",
      "Set form element value directly by ref (input, textarea, select, checkbox, radio).",
      Type.Object({
        ref: Type.String({ description: "Element ref." }),
        value: Type.String({ description: "Value to set." }),
        tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      }),
      "page.form_input",
    )(client),
  );
}
