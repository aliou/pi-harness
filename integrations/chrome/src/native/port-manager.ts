import { type BridgeStatusMessage, NATIVE_HOST_NAME } from "@/common/constants";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RETRIES = 10;

function jitter(delay: number): number {
  const jitterRange = Math.round(delay * 0.2);
  const offset =
    Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
  return Math.max(250, delay + offset);
}

export class NativePortManager {
  private port: chrome.runtime.Port | null = null;
  private shouldReconnect = true;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;

  onMessage: (message: unknown) => void = () => {};
  onStatusChange: (status: BridgeStatusMessage) => void = () => {};

  connect(): void {
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    this.openPort();
  }

  retryConnection(): void {
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }

    this.openPort();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempt = 0;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.port?.disconnect();
    this.port = null;
    this.onStatusChange({ type: "bridge_status", status: "disconnected" });
  }

  send(message: unknown): void {
    if (!this.port) {
      this.onStatusChange({
        type: "bridge_status",
        status: "error",
        error: "Native host is disconnected",
        reconnectAttempt: this.reconnectAttempt,
        reconnectMax: MAX_RETRIES,
        canRetry: true,
      });
      return;
    }

    try {
      this.port.postMessage(message);
    } catch (error) {
      this.onStatusChange({
        type: "bridge_status",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        reconnectAttempt: this.reconnectAttempt,
        reconnectMax: MAX_RETRIES,
        canRetry: true,
      });
    }
  }

  private openPort(): void {
    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      this.port.onMessage.addListener(this.handleNativeMessage);
      this.port.onDisconnect.addListener(this.handleNativeDisconnect);

      const lastError = chrome.runtime.lastError;
      if (lastError) {
        throw new Error(lastError.message);
      }

      this.reconnectAttempt = 0;
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.onStatusChange({
        type: "bridge_status",
        status: "connected",
        reconnectAttempt: 0,
        reconnectMax: MAX_RETRIES,
        canRetry: false,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.onStatusChange({
        type: "bridge_status",
        status: "error",
        error: errorMessage,
        reconnectAttempt: this.reconnectAttempt,
        reconnectMax: MAX_RETRIES,
        canRetry: true,
      });
      this.scheduleReconnect();
    }
  }

  private readonly handleNativeMessage = (message: unknown): void => {
    this.onMessage(message);
  };

  private readonly handleNativeDisconnect = (): void => {
    const error = chrome.runtime.lastError?.message;

    this.port?.onMessage.removeListener(this.handleNativeMessage);
    this.port?.onDisconnect.removeListener(this.handleNativeDisconnect);
    this.port = null;

    if (error) {
      this.onStatusChange({
        type: "bridge_status",
        status: "error",
        error,
        reconnectAttempt: this.reconnectAttempt,
        reconnectMax: MAX_RETRIES,
        canRetry: true,
      });
    } else {
      this.onStatusChange({
        type: "bridge_status",
        status: "disconnected",
        reconnectAttempt: this.reconnectAttempt,
        reconnectMax: MAX_RETRIES,
        canRetry: true,
      });
    }

    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer !== null) {
      return;
    }

    if (this.reconnectAttempt >= MAX_RETRIES) {
      this.onStatusChange({
        type: "bridge_status",
        status: "error",
        error: "Connection failed after max retries. Retry manually.",
        reconnectAttempt: this.reconnectAttempt,
        reconnectMax: MAX_RETRIES,
        canRetry: true,
      });
      return;
    }

    this.reconnectAttempt += 1;
    const delay = jitter(this.reconnectDelayMs);

    this.onStatusChange({
      type: "bridge_status",
      status: "disconnected",
      error: `Reconnect ${this.reconnectAttempt}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s`,
      reconnectAttempt: this.reconnectAttempt,
      reconnectMax: MAX_RETRIES,
      canRetry: true,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openPort();
    }, delay) as unknown as number;

    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      MAX_RECONNECT_DELAY_MS,
    );
  }
}
