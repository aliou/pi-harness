import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "../config";
import { setupGetCurrentTimeTool } from "../tools/get-current-time";
import { setupHashlineTools } from "../tools/hashline";
import { setupReadTool } from "../tools/read";

/**
 * Register all tools and configure active state based on config.
 * Always registers both standard and hashline tools, but activates only one set.
 */
export function setupTools(pi: ExtensionAPI): void {
  // Always register both tool sets
  setupReadTool(pi);
  setupHashlineTools(pi);
  setupGetCurrentTimeTool(pi);

  // Configure which tools are active based on config
  updateActiveTools(pi);
}

/**
 * Update active tools based on current config.
 * Call this after config changes to switch between tool sets.
 */
export function updateActiveTools(pi: ExtensionAPI): void {
  const config = configLoader.getConfig();
  const currentActive = pi.getActiveTools();

  if (config.hashlineEnabled) {
    // Enable hashline tools, disable standard read (keep other tools active)
    const filtered = currentActive.filter((t) => t !== "read");
    if (!filtered.includes("hashline_read")) filtered.push("hashline_read");
    if (!filtered.includes("hashline_edit")) filtered.push("hashline_edit");
    pi.setActiveTools(filtered);
  } else {
    // Enable standard read, disable hashline tools
    const filtered = currentActive.filter(
      (t) => t !== "hashline_read" && t !== "hashline_edit",
    );
    if (!filtered.includes("read")) filtered.push("read");
    pi.setActiveTools(filtered);
  }
}
