import type { ProviderRateLimits, RateLimitWindow } from "../../types";
import { type CookieSession, importOpencodeCookies } from "./cookies";

// Server IDs from Opencode's internal API (reverse-engineered from CodexBar)
// These may change without notice. If broken, check: https://github.com/steipete/CodexBar
const WORKSPACE_SERVER_ID =
  "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
const SUBSCRIPTION_SERVER_ID =
  "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4";

const SERVER_ENDPOINT = "https://opencode.ai/_server";

const CODEXBAR_REPO = "https://github.com/steipete/CodexBar";
const API_BROKEN_MSG = `Opencode API may have changed. Check if it's fixed in ${CODEXBAR_REPO}`;

interface OpencodeUsage {
  rollingUsagePercent: number;
  weeklyUsagePercent: number;
  rollingResetInSec: number;
  weeklyResetInSec: number;
}

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

function buildHeaders(
  session: CookieSession,
  serverId: string,
  referer?: string,
): Record<string, string> {
  return {
    Cookie: session.cookieHeader,
    "X-Server-Id": serverId,
    "X-Server-Instance": `server-fn:${crypto.randomUUID()}`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    Origin: "https://opencode.ai",
    Referer: referer ?? "https://opencode.ai/",
    Accept: "*/*",
    "Content-Type": "application/json",
  };
}

async function fetchWorkspaceId(
  session: CookieSession,
  signal: AbortSignal,
): Promise<string | null> {
  const headers = buildHeaders(session, WORKSPACE_SERVER_ID);

  // Try GET first, then POST (CodexBar does this)
  for (const method of ["GET", "POST"]) {
    try {
      const response = await fetch(SERVER_ENDPOINT, {
        method,
        headers,
        signal,
        body: method === "POST" ? "[]" : undefined,
      });

      if (!response.ok) continue;

      const text = await response.text();

      // Try to find workspace ID in response (format: wrk_*)
      const workspaceMatch = text.match(/wrk_[a-zA-Z0-9]+/);
      if (workspaceMatch) {
        return workspaceMatch[0];
      }

      // Try JSON parsing
      try {
        const json = JSON.parse(text);
        const id = findWorkspaceIdInObject(json);
        if (id) return id;
      } catch {
        // Not JSON, continue
      }
    } catch {}
  }

  return null;
}

function findWorkspaceIdInObject(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const id = findWorkspaceIdInObject(item);
      if (id) return id;
    }
    return null;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      (key === "id" || key === "workspaceId" || key === "workspace_id") &&
      typeof value === "string" &&
      value.startsWith("wrk_")
    ) {
      return value;
    }
    if (typeof value === "object") {
      const id = findWorkspaceIdInObject(value);
      if (id) return id;
    }
  }

  return null;
}

async function fetchUsage(
  session: CookieSession,
  workspaceId: string,
  signal: AbortSignal,
): Promise<OpencodeUsage | null> {
  const referer = `https://opencode.ai/workspace/${workspaceId}/billing`;

  // Try GET with query params first (this is what CodexBar does)
  const url = new URL(SERVER_ENDPOINT);
  url.searchParams.set("id", SUBSCRIPTION_SERVER_ID);
  url.searchParams.set("args", JSON.stringify([workspaceId]));

  const headers: Record<string, string> = {
    Cookie: session.cookieHeader,
    "X-Server-Id": SUBSCRIPTION_SERVER_ID,
    "X-Server-Instance": `server-fn:${crypto.randomUUID()}`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    Origin: "https://opencode.ai",
    Referer: referer,
    Accept: "text/javascript, application/json;q=0.9, */*;q=0.8",
  };

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal,
    });

    if (!response.ok) return null;

    const text = await response.text();

    // Try JSON parsing
    try {
      const json = JSON.parse(text);
      return parseUsageResponse(json);
    } catch {
      // Try regex extraction from the JavaScript-like response
      return parseUsageFromText(text);
    }
  } catch {
    return null;
  }
}

interface UsageWindow {
  usagePercent?: number;
  usedPercent?: number;
  percent?: number;
  used?: number;
  limit?: number;
  resetInSec?: number;
  resetInSeconds?: number;
  resetAt?: number;
}

function parseUsageResponse(data: unknown): OpencodeUsage | null {
  if (!data || typeof data !== "object") return null;

  // Look for usage windows in the response
  const windows = findUsageWindows(data);
  if (!windows.rolling && !windows.weekly) return null;

  const getPercent = (w?: UsageWindow): number => {
    if (!w) return 0;
    if (w.usagePercent !== undefined) return normalizePercent(w.usagePercent);
    if (w.usedPercent !== undefined) return normalizePercent(w.usedPercent);
    if (w.percent !== undefined) return normalizePercent(w.percent);
    if (w.used !== undefined && w.limit !== undefined && w.limit > 0) {
      return normalizePercent((w.used / w.limit) * 100);
    }
    return 0;
  };

  const getResetSec = (w?: UsageWindow): number => {
    if (!w) return 0;
    if (w.resetInSec !== undefined) return w.resetInSec;
    if (w.resetInSeconds !== undefined) return w.resetInSeconds;
    if (w.resetAt !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, w.resetAt - now);
    }
    return 0;
  };

  return {
    rollingUsagePercent: getPercent(windows.rolling),
    weeklyUsagePercent: getPercent(windows.weekly),
    rollingResetInSec: getResetSec(windows.rolling),
    weeklyResetInSec: getResetSec(windows.weekly),
  };
}

function normalizePercent(value: number): number {
  // Opencode returns percentages directly (1 = 1%, 50 = 50%)
  // Only convert if value looks like a decimal (e.g., 0.5 for 50%)
  if (value > 0 && value < 1) return value * 100;
  return Math.max(0, Math.min(100, value));
}

function getWindowSecondsFromLabel(label: string): number | undefined {
  const lower = label.toLowerCase();
  if (lower.includes("5-hour") || lower.includes("5h")) {
    return 5 * 60 * 60;
  }
  if (lower.includes("7-day") || lower.includes("week")) {
    return 7 * 24 * 60 * 60;
  }
  return undefined;
}

interface UsageWindows {
  rolling?: UsageWindow;
  weekly?: UsageWindow;
}

function findUsageWindows(obj: unknown, depth = 0): UsageWindows {
  if (depth > 10 || !obj || typeof obj !== "object") return {};

  const result: UsageWindows = {};

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const windows = findUsageWindows(item, depth + 1);
      if (windows.rolling) result.rolling = windows.rolling;
      if (windows.weekly) result.weekly = windows.weekly;
    }
    return result;
  }

  const record = obj as Record<string, unknown>;

  // Check for rolling/5-hour window
  for (const key of [
    "rolling",
    "rollingWindow",
    "rolling_window",
    "fiveHour",
    "five_hour",
  ]) {
    if (record[key] && typeof record[key] === "object") {
      result.rolling = record[key] as UsageWindow;
    }
  }

  // Check for weekly window
  for (const key of ["weekly", "weeklyWindow", "weekly_window", "sevenDay"]) {
    if (record[key] && typeof record[key] === "object") {
      result.weekly = record[key] as UsageWindow;
    }
  }

  // Recursively search
  for (const value of Object.values(record)) {
    if (typeof value === "object") {
      const windows = findUsageWindows(value, depth + 1);
      if (windows.rolling && !result.rolling) result.rolling = windows.rolling;
      if (windows.weekly && !result.weekly) result.weekly = windows.weekly;
    }
  }

  return result;
}

function parseUsageFromText(text: string): OpencodeUsage | null {
  // Parse the JavaScript-like response format:
  // rollingUsage:$R[1]={status:"ok",resetInSec:15284,usagePercent:1}
  // weeklyUsage:$R[2]={status:"ok",resetInSec:368222,usagePercent:1}

  // Extract rolling usage
  const rollingMatch = text.match(
    /rollingUsage[^}]*resetInSec[:\s]*(\d+)[^}]*usagePercent[:\s]*(\d+(?:\.\d+)?)/,
  );
  const rollingMatchAlt = text.match(
    /rollingUsage[^}]*usagePercent[:\s]*(\d+(?:\.\d+)?)[^}]*resetInSec[:\s]*(\d+)/,
  );

  // Extract weekly usage
  const weeklyMatch = text.match(
    /weeklyUsage[^}]*resetInSec[:\s]*(\d+)[^}]*usagePercent[:\s]*(\d+(?:\.\d+)?)/,
  );
  const weeklyMatchAlt = text.match(
    /weeklyUsage[^}]*usagePercent[:\s]*(\d+(?:\.\d+)?)[^}]*resetInSec[:\s]*(\d+)/,
  );

  let rollingPercent = 0;
  let rollingReset = 0;
  let weeklyPercent = 0;
  let weeklyReset = 0;

  if (rollingMatch?.[1] && rollingMatch?.[2]) {
    rollingReset = Number.parseInt(rollingMatch[1], 10);
    rollingPercent = Number.parseFloat(rollingMatch[2]);
  } else if (rollingMatchAlt?.[1] && rollingMatchAlt?.[2]) {
    rollingPercent = Number.parseFloat(rollingMatchAlt[1]);
    rollingReset = Number.parseInt(rollingMatchAlt[2], 10);
  }

  if (weeklyMatch?.[1] && weeklyMatch?.[2]) {
    weeklyReset = Number.parseInt(weeklyMatch[1], 10);
    weeklyPercent = Number.parseFloat(weeklyMatch[2]);
  } else if (weeklyMatchAlt?.[1] && weeklyMatchAlt?.[2]) {
    weeklyPercent = Number.parseFloat(weeklyMatchAlt[1]);
    weeklyReset = Number.parseInt(weeklyMatchAlt[2], 10);
  }

  // If we didn't find any data, return null
  if (
    rollingPercent === 0 &&
    weeklyPercent === 0 &&
    rollingReset === 0 &&
    weeklyReset === 0
  ) {
    return null;
  }

  return {
    rollingUsagePercent: normalizePercent(rollingPercent),
    weeklyUsagePercent: normalizePercent(weeklyPercent),
    rollingResetInSec: rollingReset,
    weeklyResetInSec: weeklyReset,
  };
}

export async function fetchOpencodeRateLimits(
  signal?: AbortSignal,
): Promise<ProviderRateLimits> {
  const session = importOpencodeCookies();

  if (!session) {
    return {
      provider: "Opencode",
      status: "unknown",
      windows: [],
      error: "Not logged in (no cookies in Helium or Safari)",
    };
  }

  const timeoutSignal = createTimeoutSignal(10000, signal);

  let workspaceId: string | null = null;
  let usage: OpencodeUsage | null = null;
  let error: string | undefined;

  try {
    workspaceId = await fetchWorkspaceId(session, timeoutSignal);

    if (!workspaceId) {
      return {
        provider: "Opencode",
        status: "unknown",
        windows: [],
        error: `Could not fetch workspace. ${API_BROKEN_MSG}`,
      };
    }

    usage = await fetchUsage(session, workspaceId, timeoutSignal);

    if (!usage) {
      return {
        provider: "Opencode",
        status: "unknown",
        windows: [],
        error: `Could not fetch usage. ${API_BROKEN_MSG}`,
      };
    }
  } catch {
    if (timeoutSignal.aborted || signal?.aborted) {
      error = "Request timeout";
    } else {
      error = `Network error. ${API_BROKEN_MSG}`;
    }
    return {
      provider: "Opencode",
      status: "unknown",
      windows: [],
      error,
    };
  }

  const windows: RateLimitWindow[] = [];

  if (usage.rollingUsagePercent > 0 || usage.rollingResetInSec > 0) {
    const label = "5-hour window";
    windows.push({
      label,
      usedPercent: usage.rollingUsagePercent,
      resetsAt: usage.rollingResetInSec
        ? new Date(Date.now() + usage.rollingResetInSec * 1000)
        : null,
      windowSeconds: getWindowSecondsFromLabel(label),
    });
  }

  if (usage.weeklyUsagePercent > 0 || usage.weeklyResetInSec > 0) {
    const label = "7-day window";
    windows.push({
      label,
      usedPercent: usage.weeklyUsagePercent,
      resetsAt: usage.weeklyResetInSec
        ? new Date(Date.now() + usage.weeklyResetInSec * 1000)
        : null,
      windowSeconds: getWindowSecondsFromLabel(label),
    });
  }

  return {
    provider: "Opencode",
    status: "operational",
    windows,
  };
}
