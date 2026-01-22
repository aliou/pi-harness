import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type {
  ProviderRateLimits,
  RateLimitWindow,
  StatusIndicator,
} from "../types";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const STATUS_URL = "https://status.openai.com/api/v2/status.json";

function mapOpenAIStatus(indicator: string | undefined): StatusIndicator {
  if (indicator === "none") return "operational";
  if (indicator === "minor") return "degraded";
  if (indicator === "major" || indicator === "critical") return "outage";
  return "unknown";
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

function formatWindowLabel(seconds: number, fallback: string): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  const days = Math.round(seconds / 86400);
  if (seconds >= 86400) {
    if (days === 7) return "7-day window";
    return `${days}-day window`;
  }
  const hours = Math.round(seconds / 3600);
  return `${hours}h window`;
}

function normalizeWindowSeconds(seconds?: number | null): number | undefined {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds);
}

export async function fetchCodexRateLimits(
  authStorage: AuthStorage,
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const token = await authStorage.getApiKey("openai-codex");
  if (!token) {
    return {
      provider: "Codex",
      status: "unknown",
      windows: [],
      error: "Not configured",
    };
  }

  const credential = authStorage.get("openai-codex") as
    | { accountId?: string; account_id?: string }
    | undefined;
  const accountId = credential?.accountId ?? credential?.account_id;

  const timeoutSignal = createTimeoutSignal(5000, signal);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "PiUsage",
    Accept: "application/json",
  };
  if (accountId) {
    headers["ChatGPT-Account-Id"] = accountId;
  }

  let status: StatusIndicator = "unknown";
  let statusMessage: string | undefined;
  let windows: RateLimitWindow[] = [];
  let error: string | undefined;
  let plan: string | undefined;

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
        status = mapOpenAIStatus(statusJson.status?.indicator);
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
          plan_type?: string;
          rate_limit?: {
            primary_window?: {
              used_percent?: number;
              limit_window_seconds?: number;
              reset_at?: number;
            } | null;
            secondary_window?: {
              used_percent?: number;
              limit_window_seconds?: number;
              reset_at?: number;
            } | null;
          };
        };
        plan = usageJson.plan_type;

        const buildWindow = (
          labelFallback: string,
          entry?: {
            used_percent?: number;
            limit_window_seconds?: number;
            reset_at?: number;
          } | null,
        ): RateLimitWindow | null => {
          if (!entry) return null;
          const usedPercent = Math.max(
            0,
            Math.min(100, entry.used_percent ?? 0),
          );
          const resetsAt = entry.reset_at
            ? new Date(entry.reset_at * 1000)
            : null;
          const label = formatWindowLabel(
            entry.limit_window_seconds ?? 0,
            labelFallback,
          );
          const windowSeconds = normalizeWindowSeconds(
            entry.limit_window_seconds,
          );
          return { label, usedPercent, resetsAt, windowSeconds };
        };

        const windowsList: Array<RateLimitWindow | null> = [
          buildWindow("5h window", usageJson.rate_limit?.primary_window),
          buildWindow("7-day window", usageJson.rate_limit?.secondary_window),
        ];
        windows = windowsList.filter(
          (window): window is RateLimitWindow => window !== null,
        );
      } catch {
        error = "Invalid response";
      }
    }
  } catch {
    if (timeoutSignal.aborted || signal?.aborted) {
      error = "Fetch failed";
    } else {
      error = "Network error";
    }
  }

  return {
    provider: "Codex",
    plan,
    status,
    statusMessage,
    windows,
    error,
  };
}
