import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type {
  ProviderRateLimits,
  RateLimitWindow,
  StatusIndicator,
} from "../types";
import { withProviderCache } from "./provider-cache";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const STATUS_URL = "https://status.claude.com/api/v2/status.json";

function mapClaudeStatus(indicator: string | undefined): StatusIndicator {
  if (indicator === "none") return "operational";
  if (indicator === "minor") return "degraded";
  if (indicator === "major" || indicator === "critical") return "outage";
  return "unknown";
}

function getWindowSeconds(label: string): number | undefined {
  const lower = label.toLowerCase();
  if (lower.includes("5-hour") || lower.includes("5h")) {
    return 5 * 60 * 60;
  }
  if (lower.includes("7-day") || lower.includes("week")) {
    return 7 * 24 * 60 * 60;
  }
  return undefined;
}

function createTimeoutSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener(
      "abort",
      () => {
        controller.abort();
      },
      { once: true },
    );
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
    once: true,
  });
  return controller.signal;
}

async function getClaudeUsageError(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "Token expired";
  }

  const retryAfter = response.headers.get("retry-after");

  let details: string | undefined;
  try {
    const body = (await response.json()) as
      | {
          message?: string;
          error?: string | { message?: string };
        }
      | undefined;
    details =
      body?.message ??
      (typeof body?.error === "string" ? body.error : body?.error?.message);
  } catch {
    // Ignore parse failures; keep fallback message below.
  }

  if (!details) {
    try {
      const text = (await response.text()).trim();
      details = text || undefined;
    } catch {
      // Ignore read failures; keep fallback message below.
    }
  }

  if (response.status === 429) {
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return `Rate limited (429, retry-after ${retryAfterSeconds}s)`;
    }
    if (details) {
      return `Rate limited (429, reset unknown): ${details}`;
    }
    return "Rate limited (429, reset unknown)";
  }

  if (response.status >= 500) {
    return details
      ? `Server error (${response.status}): ${details}`
      : `Server error (${response.status})`;
  }

  return details
    ? `Fetch failed (${response.status}): ${details}`
    : `Fetch failed (${response.status})`;
}

export async function fetchClaudeRateLimits(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const token = await authStorage.getApiKey("anthropic");
  if (!token) {
    return {
      provider: "Claude Plan",
      providerId: "anthropic",
      status: "unknown",
      windows: [],
      error: "Not configured",
    };
  }

  return withProviderCache("claude", async () => {
    const timeoutSignal = createTimeoutSignal(5000, signal);
    const headers = {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.0",
    };

    let status: StatusIndicator = "unknown";
    let statusMessage: string | undefined;
    let windows: RateLimitWindow[] = [];
    let error: string | undefined;

    try {
      const [usageResponse, statusResponse] = await Promise.all([
        fetch(USAGE_URL, { headers, signal: timeoutSignal }),
        fetch(STATUS_URL, { signal: timeoutSignal }),
      ]);

      if (!statusResponse.ok) {
        status = "unknown";
      } else {
        try {
          const statusJson = (await statusResponse.json()) as {
            status?: { indicator?: string; description?: string };
          };
          status = mapClaudeStatus(statusJson.status?.indicator);
          statusMessage = statusJson.status?.description;
        } catch {
          status = "unknown";
        }
      }

      if (!usageResponse.ok) {
        error = await getClaudeUsageError(usageResponse);
      } else {
        try {
          const usageJson = (await usageResponse.json()) as {
            five_hour?: { utilization?: number; resets_at?: string } | null;
            seven_day?: { utilization?: number; resets_at?: string } | null;
            seven_day_sonnet?: {
              utilization?: number;
              resets_at?: string;
            } | null;
            seven_day_opus?: {
              utilization?: number;
              resets_at?: string;
            } | null;
          };

          const buildWindow = (
            label: string,
            entry?: { utilization?: number; resets_at?: string } | null,
          ): RateLimitWindow | null => {
            if (!entry) return null;
            const usedPercent = Math.max(
              0,
              Math.min(100, entry.utilization ?? 0),
            );
            const resetsAt = entry.resets_at ? new Date(entry.resets_at) : null;
            const windowSeconds = getWindowSeconds(label);
            return { label, usedPercent, resetsAt, windowSeconds };
          };

          const windowsList: Array<RateLimitWindow | null> = [
            buildWindow("5-hour window", usageJson.five_hour),
            buildWindow("7-day window (all models)", usageJson.seven_day),
            buildWindow("7-day window (Sonnet)", usageJson.seven_day_sonnet),
            buildWindow("7-day window (Opus)", usageJson.seven_day_opus),
          ];
          windows = windowsList.filter(
            (window): window is RateLimitWindow => window !== null,
          );
        } catch {
          error = "Invalid response";
        }
      }
    } catch (_err) {
      if (timeoutSignal.aborted || signal?.aborted) {
        error = "Fetch failed";
      } else {
        error = "Network error";
      }
    }

    return {
      provider: "Claude Plan",
      providerId: "anthropic",
      status,
      statusMessage,
      windows,
      error,
    };
  });
}
