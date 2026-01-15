import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupRateLimitWarningHooks } from "./rate-limit-warning";

export function setupUsageHooks(pi: ExtensionAPI): void {
  setupRateLimitWarningHooks(pi);
}
