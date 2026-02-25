import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupUsageCommands } from "./commands";
import { configLoader } from "./config";
import { setupUsageHooks } from "./hooks";

export default async function providersExtension(
  pi: ExtensionAPI,
): Promise<void> {
  await configLoader.load();

  setupUsageCommands(pi);
  setupUsageHooks(pi);
}
