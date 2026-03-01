import type {
  BrowserRequest,
  BrowserResponse,
  BrowserRpcMethod,
} from "@/common/browser-rpc";
import {
  type BridgeStatusMessage,
  type ConnectionStatusMessage,
  SIDEPANEL_PORT_NAME,
} from "@/common/constants";
import type { RpcCommand, RpcEvent } from "@/common/pi-rpc-types";
import type { PageCommand } from "@/content/page-types";
import { NativePortManager } from "@/native/port-manager";
import { executeBrowserMethod, isBrowserRpcMethod } from "./browser-methods";

const sidepanelPorts = new Set<chrome.runtime.Port>();
const nativePort = new NativePortManager();

let bridgeStatus: BridgeStatusMessage = {
  type: "bridge_status",
  status: "disconnected",
};

let activeToolExecutions = 0;

const broadcast = (message: unknown): void => {
  for (const port of sidepanelPorts) {
    try {
      port.postMessage(message);
    } catch {
      sidepanelPorts.delete(port);
    }
  }
};

const sendConnectionStatus = (port: chrome.runtime.Port): void => {
  const status: ConnectionStatusMessage = {
    type: "connection_status",
    connected: bridgeStatus.status === "connected",
  };
  port.postMessage(status);
};

async function setActivePageIndicator(active: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tabId = tabs[0]?.id;
  if (typeof tabId !== "number") return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_SET_INDICATOR",
      params: { active },
    } satisfies PageCommand);
  } catch {
    // Ignore pages without content script receiver.
  }
}

const isBrowserRequest = (message: unknown): message is BrowserRequest => {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<BrowserRequest>;
  return (
    candidate.type === "browser_request" &&
    typeof candidate.id === "string" &&
    typeof candidate.method === "string" &&
    !!candidate.params &&
    typeof candidate.params === "object"
  );
};

async function handleBrowserRequest(message: BrowserRequest): Promise<void> {
  let response: BrowserResponse;

  if (!isBrowserRpcMethod(message.method)) {
    response = {
      type: "browser_response",
      id: message.id,
      ok: false,
      error: `Unsupported browser method: ${message.method}`,
    };
    nativePort.send(response);
    return;
  }

  try {
    const result = await executeBrowserMethod(
      message.method as BrowserRpcMethod,
      message.params,
    );
    response = {
      type: "browser_response",
      id: message.id,
      ok: true,
      result,
    };
  } catch (error) {
    response = {
      type: "browser_response",
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  nativePort.send(response);
}

nativePort.onStatusChange = (status) => {
  bridgeStatus = status;
  broadcast(status);
  const connectionStatus: ConnectionStatusMessage = {
    type: "connection_status",
    connected: status.status === "connected",
  };
  broadcast(connectionStatus);
};

nativePort.onMessage = (message) => {
  if (isBrowserRequest(message)) {
    void handleBrowserRequest(message);
    return;
  }

  const event = message as RpcEvent;

  if (event.type === "tool_execution_start") {
    activeToolExecutions += 1;
    if (activeToolExecutions === 1) {
      void setActivePageIndicator(true);
    }
  }

  if (event.type === "tool_execution_end") {
    activeToolExecutions = Math.max(0, activeToolExecutions - 1);
    if (activeToolExecutions === 0) {
      void setActivePageIndicator(false);
    }
  }

  if (event.type === "agent_end") {
    activeToolExecutions = 0;
    void setActivePageIndicator(false);
  }

  broadcast(event);
};

nativePort.connect();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDEPANEL_PORT_NAME) {
    return;
  }

  sidepanelPorts.add(port);
  port.postMessage(bridgeStatus);
  sendConnectionStatus(port);

  port.onMessage.addListener((message: RpcCommand) => {
    if (message.type === "retry_native_connection") {
      nativePort.retryConnection();
      return;
    }

    nativePort.send(message);
  });

  port.onDisconnect.addListener(() => {
    sidepanelPorts.delete(port);
  });
});

chrome.runtime.onStartup.addListener(() => {
  nativePort.connect();
});

chrome.runtime.onInstalled.addListener(() => {
  nativePort.connect();
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) =>
      console.error("Failed to set side panel behavior", error),
    );
});
