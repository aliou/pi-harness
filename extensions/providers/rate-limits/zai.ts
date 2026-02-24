import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ProviderRateLimits, RateLimitWindow } from "../types";

const API_URL = "https://api.z.ai/api/monitor/usage/quota/limit";

interface ZaiLimit {
  type?: string;
  unit?: number;
  number?: number;
  percentage?: number;
  nextResetTime?: string;
}

interface ZaiQuotasResponse {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: {
    limits?: ZaiLimit[];
  };
}

function loadZaiApiKey(): string | undefined {
  // Try environment variables first
  if (process.env.ZAI_API_KEY) return process.env.ZAI_API_KEY;
  if (process.env.Z_AI_API_KEY) return process.env.Z_AI_API_KEY;

  // Try pi auth.json
  const authPath = path.join(os.homedir(), ".pi", "agent", "auth.json");
  try {
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      return (
        auth["z-ai"]?.access ||
        auth["z-ai"]?.key ||
        auth.zai?.access ||
        auth.zai?.key
      );
    }
  } catch {
    // Ignore parse errors
  }

  return undefined;
}

function mapZaiToRateLimits(data: ZaiQuotasResponse): ProviderRateLimits {
  const windows: RateLimitWindow[] = [];
  const limits = data.data?.limits ?? [];

  for (const limit of limits) {
    const percent = limit.percentage ?? 0;
    const resetsAt = limit.nextResetTime ? new Date(limit.nextResetTime) : null;

    if (limit.type === "TOKENS_LIMIT") {
      windows.push({
        label: "Tokens",
        usedPercent: percent,
        resetsAt,
      });
    } else if (limit.type === "TIME_LIMIT") {
      windows.push({
        label: "Monthly",
        usedPercent: percent,
        resetsAt,
      });
    }
  }

  return {
    provider: "z.ai Plan",
    providerId: "z-ai",
    status: "operational",
    windows,
  };
}

export async function fetchZaiRateLimits(
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const apiKey = loadZaiApiKey();
  if (!apiKey) {
    return {
      provider: "z.ai Plan",
      providerId: "z-ai",
      status: "unknown",
      windows: [],
      error: "ZAI_API_KEY not set",
    };
  }

  try {
    const response = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      return {
        provider: "z.ai Plan",
        providerId: "z-ai",
        status: "degraded",
        windows: [],
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as ZaiQuotasResponse;

    if (!data.success || data.code !== 200) {
      return {
        provider: "z.ai Plan",
        providerId: "z-ai",
        status: "degraded",
        windows: [],
        error: data.msg ?? "API error",
      };
    }

    return mapZaiToRateLimits(data);
  } catch (error) {
    return {
      provider: "z.ai Plan",
      providerId: "z-ai",
      status: "outage",
      windows: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
