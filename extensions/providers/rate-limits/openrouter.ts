import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import type { ProviderRateLimits, RateLimitWindow } from "../types";

const KEY_URL = "https://openrouter.ai/api/v1/key";

function createTimeoutSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
    once: true,
  });
  return controller.signal;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getUsageValue(
  data: Record<string, unknown>,
  key: string,
): number | null {
  const direct = toNumber(data[key]);
  if (direct !== null) return direct;
  const usage = data.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  return toNumber(usage[key]);
}

function getUtcStartOfDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function getNextUtcDayBoundary(now: Date): Date {
  const start = getUtcStartOfDay(now);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

function getNextUtcWeekBoundary(now: Date): Date {
  const start = getUtcStartOfDay(now);
  const day = start.getUTCDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  start.setUTCDate(start.getUTCDate() + daysUntilMonday);
  return start;
}

function getNextUtcMonthBoundary(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function getMonthWindowSeconds(now: Date): number {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = getNextUtcMonthBoundary(now);
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

function buildWindow(
  label: string,
  used: number | null,
  limit: number | null,
  resetsAt: Date | null,
  windowSeconds: number,
): RateLimitWindow | null {
  if (used === null) return null;
  const usedPercent =
    limit && limit > 0 ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0;
  return {
    label,
    usedPercent,
    resetsAt,
    windowSeconds,
  };
}

export async function fetchOpenRouterRateLimits(
  authStorage: AuthStorage,
  providerId: "openrouter-google" | "openrouter-moonshot",
  providerName: string,
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const apiKey = await authStorage.getApiKey(providerId);
  if (!apiKey) {
    return {
      provider: providerName,
      status: "unknown",
      windows: [],
      error: "Not configured",
    };
  }

  const timeoutSignal = createTimeoutSignal(5000, signal);

  let windows: RateLimitWindow[] = [];
  let error: string | undefined;
  let statusMessage: string | undefined;

  try {
    const response = await fetch(KEY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: timeoutSignal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        error = "Token expired";
      } else {
        error = "Fetch failed";
      }
    } else {
      try {
        const payload = (await response.json()) as Record<string, unknown>;
        const data =
          (payload.data as Record<string, unknown> | undefined) ?? payload;
        const limit = toNumber(data.limit);
        const limitReset = data.limit_reset as string | undefined;

        if (!limitReset) {
          return {
            provider: providerName,
            status: "unknown",
            windows: [],
            error: "Invalid response",
          };
        }

        if (limit === null) {
          statusMessage = "Unlimited";
        }

        const now = new Date();
        let window: RateLimitWindow | null = null;

        if (limitReset === "daily") {
          const usage = getUsageValue(data, "usage_daily");
          window = buildWindow(
            "Daily window",
            usage,
            limit,
            getNextUtcDayBoundary(now),
            24 * 60 * 60,
          );
        } else if (limitReset === "weekly") {
          const usage = getUsageValue(data, "usage_weekly");
          window = buildWindow(
            "Weekly window",
            usage,
            limit,
            getNextUtcWeekBoundary(now),
            7 * 24 * 60 * 60,
          );
        } else if (limitReset === "monthly") {
          const usage = getUsageValue(data, "usage_monthly");
          window = buildWindow(
            "Monthly window",
            usage,
            limit,
            getNextUtcMonthBoundary(now),
            getMonthWindowSeconds(now),
          );
        }

        windows = window ? [window] : [];
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
    provider: providerName,
    status: error ? "unknown" : "operational",
    statusMessage,
    windows,
    error,
  };
}
