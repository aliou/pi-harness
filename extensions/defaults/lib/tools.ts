import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupEditTool } from "../tools/edit";
import { setupGetCurrentTimeTool } from "../tools/get-current-time";
import { setupReadTool } from "../tools/read";

export function setupTools(pi: ExtensionAPI): void {
  setupEditTool(pi);
  setupReadTool(pi);
  setupGetCurrentTimeTool(pi);
}
