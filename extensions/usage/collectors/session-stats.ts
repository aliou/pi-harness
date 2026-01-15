import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ModelStats,
  ProviderStats,
  TimeFilteredStats,
  TokenStats,
  UsageStats,
} from "../types";

type SessionMessage = {
  provider: string;
  model: string;
  cost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  timestamp: number;
};

function getSessionsDir(): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "sessions");
}

async function getAllSessionFiles(signal?: AbortSignal): Promise<string[]> {
  const sessionsDir = getSessionsDir();
  const files: string[] = [];

  try {
    const cwdDirs = await readdir(sessionsDir, { withFileTypes: true });
    for (const dir of cwdDirs) {
      if (signal?.aborted) return files;
      if (!dir.isDirectory()) continue;
      const cwdPath = join(sessionsDir, dir.name);
      try {
        const sessionFiles = await readdir(cwdPath);
        for (const file of sessionFiles) {
          if (file.endsWith(".jsonl")) {
            files.push(join(cwdPath, file));
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  } catch {
    return files;
  }

  return files;
}

async function parseSessionFile(
  filePath: string,
  seenHashes: Set<string>,
  signal?: AbortSignal,
): Promise<{ sessionId: string; messages: SessionMessage[] } | null> {
  try {
    const content = await readFile(filePath, "utf8");
    if (signal?.aborted) return null;
    const lines = content.trim().split("\n");
    const messages: SessionMessage[] = [];
    let sessionId = "";

    for (let i = 0; i < lines.length; i++) {
      if (signal?.aborted) return null;
      if (i % 500 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const line = lines[i];
      if (!line?.trim()) continue;

      try {
        const entry = JSON.parse(line);

        if (entry.type === "session") {
          sessionId = entry.id ?? sessionId;
        } else if (
          entry.type === "message" &&
          entry.message?.role === "assistant"
        ) {
          const message = entry.message;
          if (message.usage && message.provider && message.model) {
            const input = message.usage.input || 0;
            const output = message.usage.output || 0;
            const cacheRead = message.usage.cacheRead || 0;
            const cacheWrite = message.usage.cacheWrite || 0;
            const fallbackTs = entry.timestamp
              ? new Date(entry.timestamp).getTime()
              : 0;
            const timestamp =
              message.timestamp || (Number.isNaN(fallbackTs) ? 0 : fallbackTs);
            const totalTokens = input + output + cacheRead + cacheWrite;
            const hash = `${timestamp}:${totalTokens}`;
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);

            messages.push({
              provider: message.provider,
              model: message.model,
              cost: message.usage.cost?.total || 0,
              input,
              output,
              cacheRead,
              cacheWrite,
              timestamp,
            });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return sessionId ? { sessionId, messages } : null;
  } catch {
    return null;
  }
}

function emptyTokens(): TokenStats {
  return { total: 0, input: 0, output: 0, cache: 0 };
}

function emptyModelStats(): ModelStats {
  return { sessions: new Set(), messages: 0, cost: 0, tokens: emptyTokens() };
}

function emptyProviderStats(): ProviderStats {
  return {
    sessions: new Set(),
    messages: 0,
    cost: 0,
    tokens: emptyTokens(),
    models: new Map(),
  };
}

function emptyTimeFilteredStats(): TimeFilteredStats {
  return {
    providers: new Map(),
    totals: { sessions: 0, messages: 0, cost: 0, tokens: emptyTokens() },
  };
}

function accumulateStats(
  target: { messages: number; cost: number; tokens: TokenStats },
  cost: number,
  tokens: TokenStats,
): void {
  target.messages += 1;
  target.cost += cost;
  target.tokens.total += tokens.total;
  target.tokens.input += tokens.input;
  target.tokens.output += tokens.output;
  target.tokens.cache += tokens.cache;
}

export async function collectSessionStats(
  signal?: AbortSignal,
): Promise<UsageStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  const weekStartMs = startOfWeek.getTime();

  const data: UsageStats = {
    today: emptyTimeFilteredStats(),
    thisWeek: emptyTimeFilteredStats(),
    allTime: emptyTimeFilteredStats(),
  };

  const sessionFiles = await getAllSessionFiles(signal);
  if (signal?.aborted) return data;
  const seenHashes = new Set<string>();

  for (const filePath of sessionFiles) {
    if (signal?.aborted) return data;
    const parsed = await parseSessionFile(filePath, seenHashes, signal);
    if (signal?.aborted) return data;
    if (!parsed) continue;

    const { sessionId, messages } = parsed;
    const sessionContributed = {
      today: false,
      thisWeek: false,
      allTime: false,
    };

    for (const message of messages) {
      if (signal?.aborted) return data;
      const periods: Array<"today" | "thisWeek" | "allTime"> = ["allTime"];
      if (message.timestamp >= todayMs) periods.push("today");
      if (message.timestamp >= weekStartMs) periods.push("thisWeek");

      const tokens: TokenStats = {
        total: message.input + message.output,
        input: message.input,
        output: message.output,
        cache: message.cacheRead + message.cacheWrite,
      };

      for (const period of periods) {
        const stats = data[period];
        let providerStats = stats.providers.get(message.provider);
        if (!providerStats) {
          providerStats = emptyProviderStats();
          stats.providers.set(message.provider, providerStats);
        }

        let modelStats = providerStats.models.get(message.model);
        if (!modelStats) {
          modelStats = emptyModelStats();
          providerStats.models.set(message.model, modelStats);
        }

        modelStats.sessions.add(sessionId);
        accumulateStats(modelStats, message.cost, tokens);

        providerStats.sessions.add(sessionId);
        accumulateStats(providerStats, message.cost, tokens);

        accumulateStats(stats.totals, message.cost, tokens);

        sessionContributed[period] = true;
      }
    }

    if (sessionContributed.today) data.today.totals.sessions += 1;
    if (sessionContributed.thisWeek) data.thisWeek.totals.sessions += 1;
    if (sessionContributed.allTime) data.allTime.totals.sessions += 1;

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return data;
}
