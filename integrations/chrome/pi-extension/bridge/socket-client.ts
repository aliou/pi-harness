import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import type {
  BrowserRequest,
  BrowserResponse,
  BrowserRpcMethod,
} from "./types";

const DEFAULT_SOCKET_PATH = "/tmp/pi-chrome-bridge.sock";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CONNECT_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 200;

interface PendingRequest {
  resolve: (response: BrowserResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener?: () => void;
}

export interface SocketClient {
  request(
    method: BrowserRpcMethod,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<BrowserResponse>;
  close(): void;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonLine(line: string): BrowserResponse | null {
  try {
    const parsed = JSON.parse(line) as Partial<BrowserResponse>;
    if (parsed.type !== "browser_response" || typeof parsed.id !== "string") {
      return null;
    }
    return {
      type: "browser_response",
      id: parsed.id,
      ok: Boolean(parsed.ok),
      result: parsed.result,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return null;
  }
}

function createAbortError(): Error {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

export async function createSocketClient(): Promise<SocketClient> {
  const socketPath = process.env.PI_CHROME_BRIDGE_SOCKET || DEFAULT_SOCKET_PATH;

  let socket: Socket | null = null;
  let connectError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      socket = await new Promise<Socket>((resolve, reject) => {
        const conn = createConnection(socketPath);
        conn.once("connect", () => resolve(conn));
        conn.once("error", reject);
      });
      connectError = null;
      break;
    } catch (error) {
      connectError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_CONNECT_ATTEMPTS) {
        await wait(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  if (!socket) {
    throw new Error(
      `Failed to connect to browser bridge socket ${socketPath}: ${connectError?.message ?? "unknown error"}`,
    );
  }

  const pending = new Map<string, PendingRequest>();
  let buffer = "";

  const rejectAllPending = (message: string): void => {
    for (const [id, entry] of pending.entries()) {
      clearTimeout(entry.timeout);
      entry.removeAbortListener?.();
      entry.reject(new Error(message));
      pending.delete(id);
    }
  };

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");

    while (true) {
      const index = buffer.indexOf("\n");
      if (index === -1) break;

      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;

      const response = parseJsonLine(line);
      if (!response) continue;

      const request = pending.get(response.id);
      if (!request) continue;

      clearTimeout(request.timeout);
      request.removeAbortListener?.();
      pending.delete(response.id);
      request.resolve(response);
    }
  });

  socket.on("error", (error) => {
    rejectAllPending(`Browser bridge socket error: ${error.message}`);
  });

  socket.on("close", () => {
    rejectAllPending("Browser bridge socket closed");
  });

  return {
    request(method, params, signal) {
      if (!socket || socket.destroyed || !socket.writable) {
        return Promise.reject(
          new Error(
            "Browser bridge is unavailable. Native host socket is disconnected.",
          ),
        );
      }

      if (signal?.aborted) {
        return Promise.reject(createAbortError());
      }

      const id = randomUUID();
      const payload: BrowserRequest = {
        type: "browser_request",
        id,
        method,
        params,
      };

      return new Promise<BrowserResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const entry = pending.get(id);
          if (!entry) return;
          pending.delete(id);
          entry.removeAbortListener?.();
          reject(
            new Error(
              `Browser request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
            ),
          );
        }, DEFAULT_TIMEOUT_MS);

        const pendingEntry: PendingRequest = {
          resolve,
          reject,
          timeout,
        };

        if (signal) {
          const onAbort = () => {
            const entry = pending.get(id);
            if (!entry) return;
            clearTimeout(entry.timeout);
            pending.delete(id);
            entry.removeAbortListener?.();
            reject(createAbortError());
          };

          signal.addEventListener("abort", onAbort, { once: true });
          pendingEntry.removeAbortListener = () => {
            signal.removeEventListener("abort", onAbort);
          };
        }

        pending.set(id, pendingEntry);

        const activeSocket = socket;
        if (!activeSocket || activeSocket.destroyed || !activeSocket.writable) {
          clearTimeout(timeout);
          pendingEntry.removeAbortListener?.();
          pending.delete(id);
          reject(
            new Error(
              "Browser bridge is unavailable. Native host socket is disconnected.",
            ),
          );
          return;
        }

        activeSocket.write(`${JSON.stringify(payload)}\n`, (error) => {
          if (!error) return;
          clearTimeout(timeout);
          pendingEntry.removeAbortListener?.();
          pending.delete(id);
          reject(new Error(`Failed to send browser request: ${error.message}`));
        });
      });
    },
    close() {
      rejectAllPending("Browser bridge client closed");
      socket?.end();
      socket?.destroy();
      socket = null;
    },
  };
}
