import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerNvimConnectionRenderer } from "./nvim-connection-renderer";
import { registerNvimDiagnosticsRenderer } from "./nvim-diagnostics-renderer";

export function registerRenderers(pi: ExtensionAPI) {
  registerNvimDiagnosticsRenderer(pi);
  registerNvimConnectionRenderer(pi);
}
