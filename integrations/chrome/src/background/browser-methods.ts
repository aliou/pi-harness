import {
  BROWSER_RPC_METHODS,
  type BrowserRpcMethod,
} from "@/common/browser-rpc";
import type {
  PageClickParams,
  PageFindParams,
  PageFormInputParams,
  PageHoverParams,
  PageKeyParams,
  PageScrollParams,
  PageTypeParams,
} from "@/content/page-types";
import { debugEventStore } from "./debug-events";
import {
  createBlobUrlInOffscreen,
  revokeBlobUrlInOffscreen,
} from "./offscreen";
import { sessionManager } from "./session-manager";
import { sendToContentScript } from "./tab-manager";

export type BrowserMethodParams = Record<string, unknown>;

type MethodHandler = (params: BrowserMethodParams) => Promise<unknown>;

const MAX_SCREENSHOT_BYTES = 900 * 1024;

const toTabSummary = (tab: chrome.tabs.Tab | undefined) => {
  if (!tab) {
    throw new Error("Tab operation did not return a tab");
  }

  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    active: tab.active,
    windowId: tab.windowId,
  };
};

const asTabId = (params: BrowserMethodParams): number | undefined => {
  const value = params.tabId;
  return typeof value === "number" ? value : undefined;
};

function withoutTabId(params: BrowserMethodParams): Record<string, unknown> {
  const { tabId: _tabId, ...rest } = params;
  return rest;
}

function asRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function asOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number") {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function asPageClickParams(params: BrowserMethodParams): PageClickParams {
  const x = asOptionalNumber(params.x, "x");
  const y = asOptionalNumber(params.y, "y");
  const ref = asOptionalString(params.ref, "ref");

  if (!ref && (x === undefined || y === undefined)) {
    throw new Error("page.click requires ref or both x and y");
  }

  return { ref, x, y };
}

function asPageTypeParams(params: BrowserMethodParams): PageTypeParams {
  return {
    ref: asOptionalString(params.ref, "ref"),
    text: asRequiredString(params.text, "text"),
  };
}

function asPageScrollParams(params: BrowserMethodParams): PageScrollParams {
  const direction = asRequiredString(params.direction, "direction");
  if (!["up", "down", "left", "right"].includes(direction)) {
    throw new Error("direction must be one of: up, down, left, right");
  }

  return {
    direction: direction as PageScrollParams["direction"],
    amount: asOptionalNumber(params.amount, "amount"),
    ref: asOptionalString(params.ref, "ref"),
  };
}

function asPageKeyParams(params: BrowserMethodParams): PageKeyParams {
  return { keys: asRequiredString(params.keys, "keys") };
}

function asPageHoverParams(params: BrowserMethodParams): PageHoverParams {
  const x = asOptionalNumber(params.x, "x");
  const y = asOptionalNumber(params.y, "y");
  const ref = asOptionalString(params.ref, "ref");

  if (!ref && (x === undefined || y === undefined)) {
    throw new Error("page.hover requires ref or both x and y");
  }

  return { ref, x, y };
}

function asPageFormInputParams(
  params: BrowserMethodParams,
): PageFormInputParams {
  return {
    ref: asRequiredString(params.ref, "ref"),
    value: asRequiredString(params.value, "value"),
  };
}

function asPageFindParams(params: BrowserMethodParams): PageFindParams {
  return {
    query: asRequiredString(params.query, "query"),
    limit: asOptionalNumber(params.limit, "limit"),
  };
}

function asScreenshotFormat(params: BrowserMethodParams): "jpeg" | "png" {
  const format = params.format;
  if (format === undefined) return "jpeg";
  if (format === "jpeg" || format === "png") {
    return format;
  }
  throw new Error("format must be one of: jpeg, png");
}

function asScreenshotQuality(params: BrowserMethodParams): number | undefined {
  const quality = params.quality;
  if (quality === undefined) return undefined;
  if (typeof quality !== "number" || quality < 1 || quality > 100) {
    throw new Error("quality must be a number between 1 and 100");
  }
  return quality;
}

function base64ByteSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

interface CaptureResult {
  data: string;
  format: "jpeg" | "png";
}

interface LayoutMetricsResult {
  layoutViewport?: {
    clientWidth?: number;
    clientHeight?: number;
  };
}

async function captureScreenshotWithFallbacks(
  tabId: number,
  format: "jpeg" | "png",
  quality: number,
): Promise<CaptureResult> {
  const first = (await chrome.debugger.sendCommand(
    { tabId },
    "Page.captureScreenshot",
    {
      format,
      quality: format === "jpeg" ? quality : undefined,
      fromSurface: true,
    },
  )) as { data?: unknown };

  if (typeof first.data !== "string") {
    throw new Error("Screenshot capture returned invalid payload");
  }

  if (base64ByteSize(first.data) <= MAX_SCREENSHOT_BYTES) {
    return { data: first.data, format };
  }

  if (format === "jpeg") {
    const lowerQuality = (await chrome.debugger.sendCommand(
      { tabId },
      "Page.captureScreenshot",
      {
        format,
        quality: 50,
        fromSurface: true,
      },
    )) as { data?: unknown };

    if (
      typeof lowerQuality.data === "string" &&
      base64ByteSize(lowerQuality.data) <= MAX_SCREENSHOT_BYTES
    ) {
      return { data: lowerQuality.data, format };
    }

    const resized = await captureResized(tabId, format, 50);
    if (resized) {
      return resized;
    }

    throw new Error("Screenshot too large for native messaging limit");
  }

  const resizedPng = await captureResized(tabId, format);
  if (resizedPng) {
    return resizedPng;
  }

  throw new Error("Screenshot too large for native messaging limit");
}

async function captureResized(
  tabId: number,
  format: "jpeg" | "png",
  quality?: number,
): Promise<CaptureResult | null> {
  const metrics = (await chrome.debugger.sendCommand(
    { tabId },
    "Page.getLayoutMetrics",
  )) as LayoutMetricsResult;

  const width = metrics.layoutViewport?.clientWidth;
  const height = metrics.layoutViewport?.clientHeight;
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }

  const resized = (await chrome.debugger.sendCommand(
    { tabId },
    "Page.captureScreenshot",
    {
      format,
      quality: format === "jpeg" ? quality : undefined,
      fromSurface: true,
      clip: {
        x: 0,
        y: 0,
        width,
        height,
        scale: 0.5,
      },
    },
  )) as { data?: unknown };

  if (
    typeof resized.data !== "string" ||
    base64ByteSize(resized.data) > MAX_SCREENSHOT_BYTES
  ) {
    return null;
  }

  return { data: resized.data, format };
}

async function getCurrentTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (typeof tabId !== "number") {
    throw new Error("No active tab found");
  }
  return tabId;
}

async function resolveTargetTabId(
  params: BrowserMethodParams,
): Promise<number> {
  return asTabId(params) ?? getCurrentTabId();
}

const methodHandlers: Record<BrowserRpcMethod, MethodHandler> = {
  "tabs.list": async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
    }));
  },
  "tabs.get": async (params) => {
    const tabId = asTabId(params);
    if (tabId === undefined) {
      throw new Error("tabs.get requires numeric tabId");
    }

    const tab = await chrome.tabs.get(tabId);
    return toTabSummary(tab);
  },
  "tabs.current": async () => {
    const tabId = await getCurrentTabId();
    const tab = await chrome.tabs.get(tabId);
    return toTabSummary(tab);
  },
  "tabs.create": async (params) => {
    const url = typeof params.url === "string" ? params.url : undefined;
    const tab = await chrome.tabs.create({ url });
    return toTabSummary(tab);
  },
  "tabs.activate": async (params) => {
    const tabId = asTabId(params);
    if (tabId === undefined) {
      throw new Error("tabs.activate requires numeric tabId");
    }

    const tab = await chrome.tabs.update(tabId, { active: true });
    return toTabSummary(tab);
  },
  "tabs.close": async (params) => {
    const tabId = asTabId(params);
    if (tabId === undefined) {
      throw new Error("tabs.close requires numeric tabId");
    }

    await chrome.tabs.remove(tabId);
    return { ok: true };
  },
  "tabs.update": async (params) => {
    const tabId = await resolveTargetTabId(params);
    const url = params.url;
    if (typeof url !== "string") {
      throw new Error("tabs.update requires string url");
    }

    const tab = await chrome.tabs.update(tabId, { url });
    return toTabSummary(tab);
  },
  "tabs.go_back": async (params) => {
    const tabId = await resolveTargetTabId(params);
    await chrome.tabs.goBack(tabId);
    return { ok: true };
  },
  "tabs.go_forward": async (params) => {
    const tabId = await resolveTargetTabId(params);
    await chrome.tabs.goForward(tabId);
    return { ok: true };
  },
  "tabs.reload": async (params) => {
    const tabId = await resolveTargetTabId(params);
    await chrome.tabs.reload(tabId);
    return { ok: true };
  },
  "page.click": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_CLICK",
      params: asPageClickParams(withoutTabId(params)),
    });
  },
  "page.type": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_TYPE",
      params: asPageTypeParams(withoutTabId(params)),
    });
  },
  "page.scroll": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_SCROLL",
      params: asPageScrollParams(withoutTabId(params)),
    });
  },
  "page.key": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_KEY",
      params: asPageKeyParams(withoutTabId(params)),
    });
  },
  "page.hover": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_HOVER",
      params: asPageHoverParams(withoutTabId(params)),
    });
  },
  "page.form_input": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_FORM_INPUT",
      params: asPageFormInputParams(withoutTabId(params)),
    });
  },
  "page.get_text": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_GET_TEXT",
      params: {},
    });
  },
  "page.read": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_READ_PAGE",
      params: {},
    });
  },
  "page.find": async (params) => {
    const tabId = await resolveTargetTabId(params);
    return sendToContentScript(tabId, {
      type: "PAGE_FIND",
      params: asPageFindParams(withoutTabId(params)),
    });
  },
  "page.screenshot": async (params) => {
    const tabId = await resolveTargetTabId(params);
    const format = asScreenshotFormat(params);
    const quality = asScreenshotQuality(params) ?? 80;

    await debugEventStore.ensureAttached(tabId);

    try {
      return await captureScreenshotWithFallbacks(tabId, format, quality);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No tab with given id")) {
        throw new Error("Tab was closed");
      }
      throw error;
    }
  },
  "debug.read_console_messages": async (params) => {
    const tabId = await resolveTargetTabId(params);
    await debugEventStore.ensureAttached(tabId);
    return debugEventStore.getConsoleMessages(tabId, {
      level: asOptionalString(params.level, "level"),
      pattern: asOptionalString(params.pattern, "pattern"),
    });
  },
  "debug.read_network_requests": async (params) => {
    const tabId = await resolveTargetTabId(params);
    await debugEventStore.ensureAttached(tabId);
    return debugEventStore.getNetworkRequests(tabId, {
      method: asOptionalString(params.method, "method"),
      urlPattern: asOptionalString(params.urlPattern, "urlPattern"),
    });
  },
  "debug.export_network_requests": async (params) => {
    const tabId = await resolveTargetTabId(params);
    await debugEventStore.ensureAttached(tabId);

    const urlPattern = asOptionalString(params.urlPattern, "urlPattern");
    const method = asOptionalString(params.method, "method");
    const filename =
      asOptionalString(params.filename, "filename") ??
      `pi-network-export-${Date.now()}.json`;

    const entries = debugEventStore.exportNetworkRequests(tabId, {
      method,
      urlPattern,
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      tabId,
      filters: {
        method,
        urlPattern,
      },
      count: entries.length,
      entries,
    };

    const blobUrl = await createBlobUrlInOffscreen(payload);

    try {
      const downloadId = await chrome.downloads.download({
        url: blobUrl,
        filename,
        saveAs: false,
      });

      return {
        ok: true,
        downloadId,
        filename,
        count: entries.length,
      };
    } finally {
      void revokeBlobUrlInOffscreen(blobUrl).catch(() => {
        // Ignore cleanup failures.
      });
    }
  },
  "sessions.list": async () => {
    const sessions = await sessionManager.list();
    return { sessions };
  },
  "sessions.switch": async (params) => {
    const sessionPath = asRequiredString(params.sessionPath, "sessionPath");
    return { sessionPath };
  },
};

export function isBrowserRpcMethod(method: string): method is BrowserRpcMethod {
  return (BROWSER_RPC_METHODS as readonly string[]).includes(method);
}

export async function executeBrowserMethod(
  method: BrowserRpcMethod,
  params: BrowserMethodParams,
): Promise<unknown> {
  const handler = methodHandlers[method];
  return handler(params);
}
