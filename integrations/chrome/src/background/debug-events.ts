export interface ConsoleEntry {
  timestamp: number;
  level: "log" | "warn" | "error" | "info" | "debug";
  text: string;
  url?: string;
  lineNumber?: number;
}

export interface BodyPreview {
  type: "json" | "text" | "base64" | "unknown";
  length: number;
  jsonKeys?: string[];
}

export interface NetworkEntry {
  timestamp: number;
  requestId: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  type?: string;
  mimeType?: string;
  responseSize?: number;
  duration?: number;
  error?: string;
  requestBody?: BodyPreview;
  responseBody?: BodyPreview;
}

export interface NetworkExportEntry extends NetworkEntry {
  requestBodyRaw?: string;
  responseBodyRaw?: string;
  responseBodyBase64?: boolean;
}

interface StoredNetworkEntry extends NetworkEntry {
  requestBodyRaw?: string;
  responseBodyRaw?: string;
  responseBodyBase64?: boolean;
}

interface ConsoleFilters {
  level?: string;
  pattern?: string;
}

interface NetworkFilters {
  method?: string;
  urlPattern?: string;
}

const DEBUGGER_VERSION = "1.3";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function normalizeConsoleLevel(level: unknown): ConsoleEntry["level"] {
  if (typeof level !== "string") return "log";

  if (level === "warning") return "warn";
  if (["log", "warn", "error", "info", "debug"].includes(level)) {
    return level as ConsoleEntry["level"];
  }

  return "log";
}

function deriveBodyPreview(
  body: string,
  opts?: { mimeType?: string; base64?: boolean },
): BodyPreview {
  const mimeType = opts?.mimeType?.toLowerCase() ?? "";
  const base64 = opts?.base64 === true;

  if (base64) {
    return {
      type: "base64",
      length: body.length,
    };
  }

  const maybeJson =
    mimeType.includes("json") ||
    body.trim().startsWith("{") ||
    body.trim().startsWith("[");

  if (!maybeJson) {
    return {
      type: "text",
      length: body.length,
    };
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const jsonKeys =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed as Record<string, unknown>).slice(0, 30)
        : undefined;

    return {
      type: "json",
      length: body.length,
      jsonKeys,
    };
  } catch {
    return {
      type: "text",
      length: body.length,
    };
  }
}

export class DebugEventStore {
  private readonly consoleEntries = new Map<number, ConsoleEntry[]>();
  private readonly networkEntries = new Map<number, StoredNetworkEntry[]>();
  private readonly attachedTabs = new Set<number>();

  private readonly MAX_CONSOLE = 100;
  private readonly MAX_NETWORK = 100;
  private readonly MAX_URL_LENGTH = 500;
  private readonly MAX_TEXT_LENGTH = 10_000;

  constructor() {
    chrome.debugger.onEvent.addListener(this.onDebuggerEvent);
    chrome.debugger.onDetach.addListener(this.onDebuggerDetach);
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detach(tabId);
    });
    chrome.runtime.onSuspend.addListener(() => {
      this.detachAll();
    });
  }

  async ensureAttached(tabId: number): Promise<void> {
    if (this.attachedTabs.has(tabId)) return;

    const tab = await chrome.tabs.get(tabId);
    const url = tab.url ?? "";
    if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
      throw new Error("Debugger cannot attach to chrome:// or extension pages");
    }

    try {
      await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Another debugger is already attached")) {
        throw new Error("Another debugger is already attached to this tab");
      }
      if (message.includes("No tab with given id")) {
        throw new Error("Tab was closed");
      }
      throw error;
    }

    try {
      await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
      await chrome.debugger.sendCommand({ tabId }, "Network.enable");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");
      this.attachedTabs.add(tabId);
    } catch (error) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch {
        // Ignore detach cleanup errors.
      }
      throw error;
    }
  }

  getConsoleMessages(tabId: number, options?: ConsoleFilters): ConsoleEntry[] {
    const entries = this.consoleEntries.get(tabId) ?? [];

    return entries.filter((entry) => {
      if (options?.level && entry.level !== options.level) {
        return false;
      }

      if (options?.pattern) {
        const pattern = options.pattern.toLowerCase();
        return entry.text.toLowerCase().includes(pattern);
      }

      return true;
    });
  }

  getNetworkRequests(tabId: number, options?: NetworkFilters): NetworkEntry[] {
    const entries = this.networkEntries.get(tabId) ?? [];

    return entries
      .filter((entry) => this.matchesNetworkFilters(entry, options))
      .map((entry) => this.toPublicNetworkEntry(entry));
  }

  exportNetworkRequests(
    tabId: number,
    options?: NetworkFilters,
  ): NetworkExportEntry[] {
    const entries = this.networkEntries.get(tabId) ?? [];

    return entries
      .filter((entry) => this.matchesNetworkFilters(entry, options))
      .map((entry) => ({
        ...this.toPublicNetworkEntry(entry),
        requestBodyRaw: entry.requestBodyRaw,
        responseBodyRaw: entry.responseBodyRaw,
        responseBodyBase64: entry.responseBodyBase64,
      }));
  }

  detach(tabId: number): void {
    if (!this.attachedTabs.has(tabId)) {
      this.consoleEntries.delete(tabId);
      this.networkEntries.delete(tabId);
      return;
    }

    this.attachedTabs.delete(tabId);
    this.consoleEntries.delete(tabId);
    this.networkEntries.delete(tabId);

    chrome.debugger.detach({ tabId }).catch(() => {
      // Ignore detach race errors.
    });
  }

  detachAll(): void {
    for (const tabId of this.attachedTabs) {
      this.detach(tabId);
    }
  }

  private readonly onDebuggerDetach = (
    source: chrome.debugger.Debuggee,
  ): void => {
    if (typeof source.tabId !== "number") return;

    this.attachedTabs.delete(source.tabId);
  };

  private readonly onDebuggerEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: unknown,
  ): void => {
    const tabId = source.tabId;
    if (typeof tabId !== "number") return;

    if (method === "Runtime.consoleAPICalled") {
      this.addConsoleEntry(tabId, params);
      return;
    }

    if (method === "Network.requestWillBeSent") {
      this.onNetworkRequestWillBeSent(tabId, params);
      return;
    }

    if (method === "Network.responseReceived") {
      this.onNetworkResponseReceived(tabId, params);
      return;
    }

    if (method === "Network.loadingFinished") {
      this.onNetworkLoadingFinished(tabId, params);
      return;
    }

    if (method === "Network.loadingFailed") {
      this.onNetworkLoadingFailed(tabId, params);
    }
  };

  private addConsoleEntry(tabId: number, rawParams: unknown): void {
    if (!rawParams || typeof rawParams !== "object") return;

    const params = rawParams as {
      type?: unknown;
      args?: Array<{ value?: unknown; description?: unknown }>;
      stackTrace?: {
        callFrames?: Array<{ url?: unknown; lineNumber?: unknown }>;
      };
    };

    const args = Array.isArray(params.args) ? params.args : [];
    const text = truncate(
      args
        .map((arg) => {
          if (typeof arg?.value === "string") return arg.value;
          if (arg?.value !== undefined) return JSON.stringify(arg.value);
          if (typeof arg?.description === "string") return arg.description;
          return "";
        })
        .filter(Boolean)
        .join(" "),
      this.MAX_TEXT_LENGTH,
    );

    const callFrame = params.stackTrace?.callFrames?.[0];
    const entry: ConsoleEntry = {
      timestamp: Date.now(),
      level: normalizeConsoleLevel(params.type),
      text,
      url:
        typeof callFrame?.url === "string"
          ? truncate(callFrame.url, this.MAX_URL_LENGTH)
          : undefined,
      lineNumber:
        typeof callFrame?.lineNumber === "number"
          ? callFrame.lineNumber
          : undefined,
    };

    this.pushBounded(this.consoleEntries, tabId, entry, this.MAX_CONSOLE);
  }

  private onNetworkRequestWillBeSent(tabId: number, rawParams: unknown): void {
    if (!rawParams || typeof rawParams !== "object") return;

    const params = rawParams as {
      requestId?: unknown;
      type?: unknown;
      request?: { method?: unknown; url?: unknown; postData?: unknown };
    };

    if (typeof params.requestId !== "string") return;

    const requestBodyRaw =
      typeof params.request?.postData === "string"
        ? params.request.postData
        : undefined;

    const entry: StoredNetworkEntry = {
      timestamp: Date.now(),
      requestId: params.requestId,
      method:
        typeof params.request?.method === "string"
          ? params.request.method
          : "GET",
      url:
        typeof params.request?.url === "string"
          ? truncate(params.request.url, this.MAX_URL_LENGTH)
          : "",
      type: typeof params.type === "string" ? params.type : undefined,
      requestBodyRaw,
      requestBody:
        typeof requestBodyRaw === "string"
          ? deriveBodyPreview(requestBodyRaw)
          : undefined,
    };

    this.pushBounded(this.networkEntries, tabId, entry, this.MAX_NETWORK);
    void this.captureRequestBody(tabId, params.requestId);
  }

  private onNetworkResponseReceived(tabId: number, rawParams: unknown): void {
    if (!rawParams || typeof rawParams !== "object") return;

    const params = rawParams as {
      requestId?: unknown;
      response?: { status?: unknown; statusText?: unknown; mimeType?: unknown };
      type?: unknown;
    };

    if (typeof params.requestId !== "string") return;

    this.updateNetworkEntry(tabId, params.requestId, (entry) => {
      if (typeof params.response?.status === "number") {
        entry.status = params.response.status;
      }
      if (typeof params.response?.statusText === "string") {
        entry.statusText = params.response.statusText;
      }
      if (typeof params.type === "string") {
        entry.type = params.type;
      }
      if (typeof params.response?.mimeType === "string") {
        entry.mimeType = params.response.mimeType;
      }
    });
  }

  private onNetworkLoadingFinished(tabId: number, rawParams: unknown): void {
    if (!rawParams || typeof rawParams !== "object") return;

    const params = rawParams as {
      requestId?: unknown;
      encodedDataLength?: unknown;
    };

    if (typeof params.requestId !== "string") return;

    this.updateNetworkEntry(tabId, params.requestId, (entry) => {
      entry.duration = Date.now() - entry.timestamp;
      if (typeof params.encodedDataLength === "number") {
        entry.responseSize = params.encodedDataLength;
      }
    });

    void this.captureResponseBody(tabId, params.requestId);
  }

  private onNetworkLoadingFailed(tabId: number, rawParams: unknown): void {
    if (!rawParams || typeof rawParams !== "object") return;

    const params = rawParams as {
      requestId?: unknown;
      errorText?: unknown;
    };

    if (typeof params.requestId !== "string") return;

    this.updateNetworkEntry(tabId, params.requestId, (entry) => {
      entry.duration = Date.now() - entry.timestamp;
      if (typeof params.errorText === "string") {
        entry.error = truncate(params.errorText, this.MAX_TEXT_LENGTH);
      }
    });
  }

  private async captureRequestBody(
    tabId: number,
    requestId: string,
  ): Promise<void> {
    try {
      const result = (await chrome.debugger.sendCommand(
        { tabId },
        "Network.getRequestPostData",
        { requestId },
      )) as { postData?: unknown };

      this.updateNetworkEntry(tabId, requestId, (entry) => {
        if (typeof result.postData !== "string") return;
        entry.requestBodyRaw = result.postData;
        entry.requestBody = deriveBodyPreview(result.postData);
      });
    } catch {
      // Ignore post-data read failures (no body, non-POST, or unavailable).
    }
  }

  private async captureResponseBody(
    tabId: number,
    requestId: string,
  ): Promise<void> {
    try {
      const result = (await chrome.debugger.sendCommand(
        { tabId },
        "Network.getResponseBody",
        { requestId },
      )) as { body?: unknown; base64Encoded?: unknown };

      this.updateNetworkEntry(tabId, requestId, (entry) => {
        if (typeof result.body !== "string") return;

        entry.responseBodyRaw = result.body;
        entry.responseBodyBase64 = result.base64Encoded === true;
        entry.responseBody = deriveBodyPreview(result.body, {
          mimeType: entry.mimeType,
          base64: result.base64Encoded === true,
        });
      });
    } catch {
      // Ignore body read failures (opaque response, not ready, binary, etc.)
    }
  }

  private matchesNetworkFilters(
    entry: StoredNetworkEntry,
    options?: NetworkFilters,
  ): boolean {
    if (
      options?.method &&
      entry.method.toUpperCase() !== options.method.toUpperCase()
    ) {
      return false;
    }

    if (options?.urlPattern) {
      const pattern = options.urlPattern.toLowerCase();
      return entry.url.toLowerCase().includes(pattern);
    }

    return true;
  }

  private toPublicNetworkEntry(entry: StoredNetworkEntry): NetworkEntry {
    return {
      timestamp: entry.timestamp,
      requestId: entry.requestId,
      method: entry.method,
      url: entry.url,
      status: entry.status,
      statusText: entry.statusText,
      type: entry.type,
      mimeType: entry.mimeType,
      responseSize: entry.responseSize,
      duration: entry.duration,
      error: entry.error,
      requestBody: entry.requestBody,
      responseBody: entry.responseBody,
    };
  }

  private updateNetworkEntry(
    tabId: number,
    requestId: string,
    updater: (entry: StoredNetworkEntry) => void,
  ): void {
    const entries = this.networkEntries.get(tabId);
    if (!entries) return;

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.requestId !== requestId) continue;
      updater(entry);
      return;
    }
  }

  private pushBounded<T>(
    map: Map<number, T[]>,
    tabId: number,
    entry: T,
    max: number,
  ): void {
    const entries = map.get(tabId) ?? [];
    entries.push(entry);

    while (entries.length > max) {
      entries.shift();
    }

    map.set(tabId, entries);
  }
}

export const debugEventStore = new DebugEventStore();
