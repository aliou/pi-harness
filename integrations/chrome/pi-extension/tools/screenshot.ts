import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { SocketClient } from "../bridge/socket-client";

interface ScreenshotResult {
  data: string;
  format: "jpeg" | "png";
}

export function registerScreenshotTool(
  pi: ExtensionAPI,
  client: SocketClient,
): void {
  pi.registerTool({
    name: "browser_screenshot",
    label: "Screenshot",
    description:
      "Take a screenshot of the current browser tab. Returns an image for visual analysis.",
    parameters: Type.Object({
      tabId: Type.Optional(Type.Number({ description: "Target tab ID." })),
      format: Type.Optional(
        Type.Union([Type.Literal("jpeg"), Type.Literal("png")], {
          description: "Image format (default jpeg).",
        }),
      ),
      quality: Type.Optional(
        Type.Number({ description: "JPEG quality 1-100 (default 80)." }),
      ),
    }),
    execute: async (_toolCallId, params, signal) => {
      const response = await client.request(
        "page.screenshot",
        {
          ...(params ?? {}),
        },
        signal,
      );

      if (!response.ok) {
        throw new Error(response.error ?? "browser_screenshot failed");
      }

      const result = response.result as ScreenshotResult;
      return {
        content: [
          {
            type: "image",
            data: result.data,
            mimeType: `image/${result.format}`,
          },
        ],
        details: { format: result.format },
      };
    },
  });
}
