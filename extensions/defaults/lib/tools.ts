import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupBashTool } from "../tools/bash";
import { setupEditTool } from "../tools/edit";
import { setupFindTool } from "../tools/find";
import { setupGetCurrentTimeTool } from "../tools/get-current-time";
import { setupReadTool } from "../tools/read";
import { setupReadUrlTool } from "../tools/read-url";

export function setupTools(pi: ExtensionAPI): void {
  setupEditTool(pi);
  setupFindTool(pi);
  setupReadTool(pi);
  setupBashTool(pi);
  setupGetCurrentTimeTool(pi);
  setupReadUrlTool(pi);
}
