/**
 * Inject Neovim System Prompt Hook
 *
 * Injects static Neovim integration instructions into the system prompt.
 * Runs once at agent start via before_agent_start hook.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { NVIM_SYSTEM_PROMPT } from "../constants";

export function registerInjectSystemPromptHook(pi: ExtensionAPI) {
  pi.on("before_agent_start", async () => {
    return {
      systemPrompt: NVIM_SYSTEM_PROMPT,
    };
  });
}
