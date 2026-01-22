import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupRateLimitWarningHooks } from "./rate-limit-warning";
import { setupUsageBarHooks } from "./usage-bar";

export function setupUsageHooks(pi: ExtensionAPI): void {
  setupRateLimitWarningHooks(pi);
  setupUsageBarHooks(pi);
}
