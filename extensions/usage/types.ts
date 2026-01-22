// === Session tab types ===

export type StatusIndicator = "operational" | "degraded" | "outage" | "unknown";

export interface RateLimitWindow {
  label: string;
  usedPercent: number;
  resetsAt: Date | null;
  windowSeconds?: number;
}

export interface ProviderRateLimits {
  provider: string;
  plan?: string;
  status: StatusIndicator;
  statusMessage?: string;
  windows: RateLimitWindow[];
  error?: string;
}

// === Stats tabs types ===

export interface TokenStats {
  total: number;
  input: number;
  output: number;
  cache: number;
}

export interface ModelStats {
  sessions: Set<string>;
  messages: number;
  cost: number;
  tokens: TokenStats;
}

export interface ProviderStats {
  sessions: Set<string>;
  messages: number;
  cost: number;
  tokens: TokenStats;
  models: Map<string, ModelStats>;
}

export interface TimeFilteredStats {
  providers: Map<string, ProviderStats>;
  totals: {
    sessions: number;
    messages: number;
    cost: number;
    tokens: TokenStats;
  };
}

export interface UsageStats {
  today: TimeFilteredStats;
  thisWeek: TimeFilteredStats;
  allTime: TimeFilteredStats;
}

// === Combined data ===

export interface UsageData {
  rateLimits: ProviderRateLimits[];
  stats: UsageStats;
}

export type TabName = "session" | "today" | "thisWeek" | "allTime";
