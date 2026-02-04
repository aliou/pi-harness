import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupGetCurrentTimeTool } from "../tools/get-current-time";
import { setupReadTool } from "../tools/read";

export function setupTools(pi: ExtensionAPI): void {
  setupReadTool(pi);
  setupGetCurrentTimeTool(pi);
}
