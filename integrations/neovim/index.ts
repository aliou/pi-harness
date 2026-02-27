/**
 * Neovim Context Extension for Pi
 *
 * Provides Neovim integration:
 * - Auto-connects to Neovim on session start
 * - Injects current editor context (splits) on each prompt
 * - Reloads files in Neovim when write/edit tools complete
 * - Sends LSP errors for modified files at turn end
 * - nvim_context tool for on-demand queries
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type NvimConnectionState, setupNvimHooks } from "./hooks";
import { setupNvimTools } from "./tools";

export default function nvimContextExtension(pi: ExtensionAPI) {
  // Shared connection state between hook and tool
  const state: NvimConnectionState = {
    socket: null,
    lockfile: null,
    modifiedFilesThisTurn: new Set(),
  };

  setupNvimTools(pi, state);
  setupNvimHooks(pi, state);
}
