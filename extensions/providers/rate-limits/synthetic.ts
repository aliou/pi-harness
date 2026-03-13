import type { ProviderRateLimits } from "../types";
import { withProviderCache } from "./provider-cache";

const API_URL = "https://api.synthetic.new/v2/quotas";

interface SyntheticQuotasResponse {
  subscription: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
  search: {
    hourly: {
      limit: number;
      requests: number;
      renewsAt: string;
    };
  };
  freeToolCalls: {
    limit: number;
    requests: number;
    renewsAt: string;
  };
}

function mapSyntheticToRateLimits(
  data: SyntheticQuotasResponse,
): ProviderRateLimits {
  const windows: ProviderRateLimits["windows"] = [];

  // Completions window (5 hours)
  if (data.subscription.limit > 0) {
    windows.push({
      label: "Completions",
      usedPercent: (data.subscription.requests / data.subscription.limit) * 100,
      resetsAt: new Date(data.subscription.renewsAt),
      windowSeconds: 5 * 60 * 60,
      usedValue: data.subscription.requests,
      limitValue: data.subscription.limit,
      unit: "req",
    });
  }

  // Search window (1 hour)
  if (data.search.hourly.limit > 0) {
    windows.push({
      label: "Search",
      usedPercent:
        (data.search.hourly.requests / data.search.hourly.limit) * 100,
      resetsAt: new Date(data.search.hourly.renewsAt),
      windowSeconds: 60 * 60,
      usedValue: data.search.hourly.requests,
      limitValue: data.search.hourly.limit,
      unit: "req",
    });
  }

  // Free tool calls (24 hours)
  if (data.freeToolCalls.limit > 0) {
    windows.push({
      label: "Free Tool Calls",
      usedPercent:
        (data.freeToolCalls.requests / data.freeToolCalls.limit) * 100,
      resetsAt: new Date(data.freeToolCalls.renewsAt),
      windowSeconds: 24 * 60 * 60,
      usedValue: data.freeToolCalls.requests,
      limitValue: data.freeToolCalls.limit,
      unit: "calls",
    });
  }

  return {
    provider: "Synthetic",
    providerId: "synthetic",
    status: "operational",
    windows,
  };
}

export async function fetchSyntheticRateLimits(
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const apiKey = process.env.SYNTHETIC_API_KEY;
  if (!apiKey) {
    return {
      provider: "Synthetic",
      providerId: "synthetic",
      status: "unknown",
      windows: [],
      error: "SYNTHETIC_API_KEY not set",
    };
  }

  return withProviderCache("synthetic", async () => {
    try {
      const response = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });

      if (!response.ok) {
        return {
          provider: "Synthetic",
          providerId: "synthetic",
          status: "degraded",
          windows: [],
          error: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as SyntheticQuotasResponse;
      return mapSyntheticToRateLimits(data);
    } catch (error) {
      return {
        provider: "Synthetic",
        providerId: "synthetic",
        status: "outage",
        windows: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
