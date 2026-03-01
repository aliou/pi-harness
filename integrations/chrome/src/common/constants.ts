export const SIDEPANEL_PORT_NAME = "sidepanel";
export const NATIVE_HOST_NAME = "dev.pi.chrome.bridge";

export type BridgeStatusState = "connected" | "disconnected" | "error";

export interface ConnectionStatusMessage {
  type: "connection_status";
  connected: boolean;
}

export interface BridgeStatusMessage {
  type: "bridge_status";
  status: BridgeStatusState;
  error?: string;
  reconnectAttempt?: number;
  reconnectMax?: number;
  canRetry?: boolean;
}
