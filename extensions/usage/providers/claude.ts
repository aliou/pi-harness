import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type {
  ProviderRateLimits,
  RateLimitWindow,
  StatusIndicator,
} from "../types";

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

export async function fetchClaudeRateLimits(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const token = await authStorage.getApiKey("anthropic");
  if (!token) {
    return {
      provider: "Claude",
      status: "unknown",
      windows: [],
      error: "Not configured",
    };
  }

  const timeoutSignal = createTimeoutSignal(5000, signal);
  const headers = {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
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
      if (usageResponse.status === 401 || usageResponse.status === 403) {
        error = "Token expired";
      } else {
        error = "Fetch failed";
      }
    } else {
      try {
        const usageJson = (await usageResponse.json()) as {
          five_hour?: { utilization?: number; resets_at?: string } | null;
          seven_day?: { utilization?: number; resets_at?: string } | null;
          seven_day_sonnet?: {
            utilization?: number;
            resets_at?: string;
          } | null;
          seven_day_opus?: { utilization?: number; resets_at?: string } | null;
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
    provider: "Claude",
    status,
    statusMessage,
    windows,
    error,
  };
}
