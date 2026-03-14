import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupCodexFastModeHooks } from "./codex-fast-mode";
import { setupContextWindowOverrides } from "./context-window-overrides";
import { setupRateLimitWarningHooks } from "./rate-limit-warning";
import { setupUsageBarHooks } from "./usage-bar";

export function setupUsageHooks(pi: ExtensionAPI): void {
  setupContextWindowOverrides(pi);
  setupRateLimitWarningHooks(pi);
  setupUsageBarHooks(pi);
  setupCodexFastModeHooks(pi);
}
