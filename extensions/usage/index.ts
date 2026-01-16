import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupUsageCommands } from "./commands";
import { setupUsageHooks } from "./hooks";

export default function usageExtension(pi: ExtensionAPI): void {
  setupUsageCommands(pi);
  setupUsageHooks(pi);
}
