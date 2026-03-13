import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderRateLimits } from "../types";

export interface ProviderCacheOptions {
  cacheDir: string;
  freshTtlMs: number;
  staleIfErrorMs: number;
}

const DEFAULT_CACHE_DIR = join(
  process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
  "pi",
  "providers",
);
const DEFAULT_FRESH_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STALE_IF_ERROR_MS = 24 * 60 * 60 * 1000;

interface CacheFile {
  fetchedAt: string; // ISO string
  data: ProviderRateLimits;
}

function getCacheAgeMs(fetchedAt: string): number | null {
  const date = new Date(fetchedAt);
  if (Number.isNaN(date.getTime())) return null;
  return Date.now() - date.getTime();
}

async function readCache(
  provider: string,
  cacheDir: string,
): Promise<CacheFile | null> {
  try {
    const filePath = join(cacheDir, `${provider}.json`);
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("fetchedAt" in parsed) ||
      !("data" in parsed)
    ) {
      return null;
    }
    const cache = parsed as CacheFile;
    // Rehydrate resetsAt from string to Date
    if (Array.isArray(cache.data.windows)) {
      cache.data.windows = cache.data.windows.map((w) => ({
        ...w,
        resetsAt:
          w.resetsAt !== null && w.resetsAt !== undefined
            ? new Date(w.resetsAt as unknown as string)
            : null,
      }));
    }
    return cache;
  } catch {
    return null;
  }
}

async function writeCache(
  provider: string,
  data: ProviderRateLimits,
  cacheDir: string,
): Promise<void> {
  try {
    await mkdir(cacheDir, { recursive: true });
    const filePath = join(cacheDir, `${provider}.json`);
    const cache: CacheFile = {
      fetchedAt: new Date().toISOString(),
      data,
    };
    await writeFile(filePath, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    // ignore errors
  }
}

export async function withProviderCache(
  provider: string,
  fetchFn: () => Promise<ProviderRateLimits>,
  options?: Partial<ProviderCacheOptions>,
): Promise<ProviderRateLimits> {
  const cacheDir = options?.cacheDir ?? DEFAULT_CACHE_DIR;
  const freshTtlMs = options?.freshTtlMs ?? DEFAULT_FRESH_TTL_MS;
  const staleIfErrorMs = options?.staleIfErrorMs ?? DEFAULT_STALE_IF_ERROR_MS;

  const cached = await readCache(provider, cacheDir);

  if (cached !== null) {
    const age = getCacheAgeMs(cached.fetchedAt);
    if (age !== null && age < freshTtlMs) {
      return cached.data;
    }
  }

  const result = await fetchFn();

  if (!result.error) {
    await writeCache(provider, result, cacheDir);
    return result;
  }

  if (cached !== null) {
    const age = getCacheAgeMs(cached.fetchedAt);
    if (age !== null && age < staleIfErrorMs) {
      return cached.data;
    }
  }

  return result;
}
