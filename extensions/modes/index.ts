import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerModeControls } from "./commands/mode-command";
import {
  setupContextFilterHook,
  setupSessionSyncHooks,
  setupSystemPromptHook,
  setupToolGateHook,
} from "./hooks";
import { applyMode } from "./lib/mode-lifecycle";
import { registerModeSwitchRenderer } from "./lib/mode-switch";

export default function (pi: ExtensionAPI): void {
  pi.registerFlag("agent-mode", {
    description: "Starting modes extension mode",
    type: "string",
  });

  setupToolGateHook(pi);
  setupContextFilterHook(pi);
  setupSessionSyncHooks(pi);
  setupSystemPromptHook(pi);

  registerModeControls(pi, applyMode);
  registerModeSwitchRenderer(pi);
}
