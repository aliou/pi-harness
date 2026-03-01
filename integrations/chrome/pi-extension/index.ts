import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSocketClient } from "./bridge/socket-client";
import { registerSystemPromptHook } from "./hooks/system-prompt";
import { registerDebugTools } from "./tools/debug";
import { registerPageTools } from "./tools/page";
import { registerPageReadTools } from "./tools/page-read";
import { registerScreenshotTool } from "./tools/screenshot";
import { registerTabTools } from "./tools/tabs";

export default async function registerExtension(
  pi: ExtensionAPI,
): Promise<void> {
  const client = await createSocketClient();

  registerSystemPromptHook(pi);
  registerTabTools(pi, client);
  registerPageTools(pi, client);
  registerPageReadTools(pi, client);
  registerScreenshotTool(pi, client);
  registerDebugTools(pi, client);

  pi.on("session_shutdown", async () => {
    client.close();
    return undefined;
  });
}
