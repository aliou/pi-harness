export interface SessionSummaryRecord {
  sessionPath: string;
  sessionName?: string;
  updatedAt: number;
  messageCount?: number;
}

const STORAGE_KEY = "pi.chrome.session-summaries.v1";

function asRecordArray(value: unknown): SessionSummaryRecord[] {
  if (!Array.isArray(value)) return [];

  const records: SessionSummaryRecord[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const sessionPath = obj.sessionPath;
    if (typeof sessionPath !== "string" || !sessionPath) continue;

    const record: SessionSummaryRecord = {
      sessionPath,
      updatedAt:
        typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)
          ? obj.updatedAt
          : Date.now(),
    };

    if (typeof obj.sessionName === "string") {
      record.sessionName = obj.sessionName;
    }
    if (typeof obj.messageCount === "number") {
      record.messageCount = obj.messageCount;
    }

    records.push(record);
  }

  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export class SessionManager {
  async list(): Promise<SessionSummaryRecord[]> {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      return asRecordArray(stored[STORAGE_KEY]);
    } catch {
      return [];
    }
  }

  async rememberFromState(data: Record<string, unknown>): Promise<void> {
    const sessionPath = data.sessionFile;
    if (typeof sessionPath !== "string" || !sessionPath) {
      return;
    }

    const sessionName =
      typeof data.sessionName === "string" ? data.sessionName : undefined;
    const messageCount =
      typeof data.messageCount === "number" ? data.messageCount : undefined;

    const sessions = await this.list();
    const updated: SessionSummaryRecord = {
      sessionPath,
      sessionName,
      updatedAt: Date.now(),
      messageCount,
    };

    const deduped = sessions.filter((s) => s.sessionPath !== sessionPath);
    deduped.unshift(updated);

    await chrome.storage.local.set({ [STORAGE_KEY]: deduped.slice(0, 200) });
  }
}

export const sessionManager = new SessionManager();
