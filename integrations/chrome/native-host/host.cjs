#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");
const readline = require("node:readline");
const net = require("node:net");

const MAX_MESSAGE_SIZE = 1024 * 1024;
const PI_AGENT_DIR = path.join(os.homedir(), ".pi", "chrome");
const LOG_DIR = path.join(PI_AGENT_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "native-host.log");
const SOCKET_PATH = process.env.PI_CHROME_BRIDGE_SOCKET || "/tmp/pi-chrome-bridge.sock";
const SESSION_DIR = path.join(PI_AGENT_DIR, "sessions");
const SESSION_LIST_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_IN_FLIGHT_REQUESTS = 10;
const BROWSER_METHOD_ALLOWLIST = new Set([
  "tabs.list",
  "tabs.get",
  "tabs.current",
  "tabs.create",
  "tabs.activate",
  "tabs.close",
  "tabs.update",
  "tabs.go_back",
  "tabs.go_forward",
  "tabs.reload",
  "page.click",
  "page.type",
  "page.scroll",
  "page.key",
  "page.hover",
  "page.form_input",
  "page.get_text",
  "page.read",
  "page.find",
  "page.screenshot",
  "debug.read_console_messages",
  "debug.read_network_requests",
  "debug.export_network_requests",
  "sessions.list",
  "sessions.switch",
]);

let inputBuffer = Buffer.alloc(0);
let piProcess = null;
let socketServer = null;
let socketClient = null;
let socketBuffer = "";

const pendingBrowserRequests = new Map();

fs.mkdirSync(LOG_DIR, { recursive: true });

function now() {
  return new Date().toISOString();
}

function log(message) {
  const line = `[${now()}] ${message}`;
  process.stderr.write(`${line}\n`);
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // Keep host alive even if file logging fails.
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logMessageFlow(direction, message) {
  const raw = safeStringify(message);
  const max = 4000;
  const summary = raw.length > max ? `${raw.slice(0, max)}... [truncated ${raw.length - max} chars]` : raw;
  log(`${direction} ${summary}`);
}

function sendNativeMessage(message) {
  logMessageFlow("HOST->BROWSER", message);
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.length > MAX_MESSAGE_SIZE) {
    const errorMessage = `Native message too large (${payload.length} bytes)`;
    log(errorMessage);
    return;
  }

  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

function emitBridgeError(error) {
  log(`Bridge error: ${error}`);
  sendNativeMessage({
    type: "bridge_status",
    status: "error",
    error,
  });
}

function cleanupSocketFile() {
  try {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
  } catch (error) {
    log(`Failed to cleanup socket file ${SOCKET_PATH}: ${error.message}`);
  }
}

function sendSocketResponse(response) {
  if (!socketClient || socketClient.destroyed || !socketClient.writable) {
    return;
  }

  try {
    logMessageFlow("HOST->SOCKET", response);
    socketClient.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    log(`Failed to write socket response: ${error.message}`);
  }
}

function clearPendingBrowserRequests(reason) {
  for (const [id, pending] of pendingBrowserRequests.entries()) {
    clearTimeout(pending.timeout);
    sendSocketResponse({
      type: "browser_response",
      id,
      ok: false,
      error: reason,
    });
    pendingBrowserRequests.delete(id);
  }
}

function onBrowserResponse(message) {
  if (!message || typeof message !== "object" || typeof message.id !== "string") {
    return false;
  }

  const pending = pendingBrowserRequests.get(message.id);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeout);
  pendingBrowserRequests.delete(message.id);
  sendSocketResponse(message);
  return true;
}

function forwardBrowserRequestToChrome(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  const id = typeof message.id === "string" ? message.id : null;
  const method = typeof message.method === "string" ? message.method : null;

  if (!id || !method || !BROWSER_METHOD_ALLOWLIST.has(method)) {
    sendSocketResponse({
      type: "browser_response",
      id: id || "unknown",
      ok: false,
      error: id ? `Method not allowed: ${String(method)}` : "Invalid browser request",
    });
    return;
  }

  if (pendingBrowserRequests.size >= MAX_IN_FLIGHT_REQUESTS) {
    sendSocketResponse({
      type: "browser_response",
      id,
      ok: false,
      error: `Too many in-flight browser requests (${MAX_IN_FLIGHT_REQUESTS})`,
    });
    return;
  }

  const timeout = setTimeout(() => {
    pendingBrowserRequests.delete(id);
    sendSocketResponse({
      type: "browser_response",
      id,
      ok: false,
      error: "Request timed out",
    });
  }, REQUEST_TIMEOUT_MS);

  pendingBrowserRequests.set(id, { timeout });
  sendNativeMessage(message);
}

function processSocketLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const message = JSON.parse(trimmed);
    logMessageFlow("SOCKET->HOST", message);
    if (message.type === "browser_request") {
      forwardBrowserRequestToChrome(message);
      return;
    }

    log(`Ignoring unsupported socket message type: ${String(message.type)}`);
  } catch (error) {
    log(`Invalid JSON from socket client: ${error.message}`);
  }
}

function startSocketServer() {
  cleanupSocketFile();

  socketServer = net.createServer((client) => {
    if (socketClient && socketClient !== client) {
      socketClient.destroy();
    }

    socketClient = client;
    socketBuffer = "";
    log(`Socket client connected: ${SOCKET_PATH}`);

    client.on("data", (chunk) => {
      socketBuffer += chunk.toString("utf8");

      while (true) {
        const newlineIndex = socketBuffer.indexOf("\n");
        if (newlineIndex === -1) break;

        const line = socketBuffer.slice(0, newlineIndex);
        socketBuffer = socketBuffer.slice(newlineIndex + 1);
        processSocketLine(line);
      }
    });

    client.on("error", (error) => {
      log(`Socket client error: ${error.message}`);
      clearPendingBrowserRequests(`Browser bridge socket error: ${error.message}`);
    });

    client.on("close", () => {
      if (socketClient === client) {
        socketClient = null;
      }
      log("Socket client disconnected");
      clearPendingBrowserRequests("Browser bridge socket disconnected");
    });
  });

  socketServer.on("error", (error) => {
    emitBridgeError(`Socket server error: ${error.message}`);
  });

  socketServer.listen(SOCKET_PATH, () => {
    log(`Socket bridge listening on ${SOCKET_PATH}`);
  });
}

function stopSocketServer() {
  if (socketClient) {
    socketClient.destroy();
    socketClient = null;
  }

  if (socketServer) {
    socketServer.close();
    socketServer = null;
  }

  cleanupSocketFile();
}

function collectSessionFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSessionFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(fullPath);
    }
  }

  return out;
}

function readFirstUserMessage(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    let messageCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (parsed?.type !== "message") continue;
      messageCount += 1;

      const msg = parsed.message;
      if (msg?.role !== "user") continue;

      const contentBlocks = Array.isArray(msg.content) ? msg.content : [];
      const text = contentBlocks
        .map((block) => (block && typeof block === "object" ? block.text : ""))
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .trim();

      if (text) {
        return { firstUserMessage: text, messageCount };
      }
    }

    return { firstUserMessage: "", messageCount };
  } catch {
    return { firstUserMessage: "", messageCount: 0 };
  }
}

function deriveSessionLabel(filePath, firstUserMessage) {
  if (firstUserMessage) {
    const oneLine = firstUserMessage.replace(/\s+/g, " ").trim();
    return oneLine.length <= 70 ? oneLine : `${oneLine.slice(0, 67)}...`;
  }

  const base = path.basename(filePath, ".jsonl");
  return base.replace(/_/g, " ");
}

function listSessions() {
  if (!fs.existsSync(SESSION_DIR)) {
    return [];
  }

  const files = collectSessionFiles(SESSION_DIR)
    .map((sessionPath) => {
      try {
        const stat = fs.statSync(sessionPath);
        return { sessionPath, updatedAt: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SESSION_LIST_LIMIT);

  return files.map(({ sessionPath, updatedAt }) => {
    const { firstUserMessage, messageCount } = readFirstUserMessage(sessionPath);
    return {
      sessionPath,
      sessionName: deriveSessionLabel(sessionPath, firstUserMessage),
      updatedAt,
      messageCount,
    };
  });
}

function ensurePiProcess() {
  if (piProcess) {
    return;
  }

  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: PI_AGENT_DIR,
    PI_CHROME_BRIDGE_SOCKET: SOCKET_PATH,
  };

  const piBin = process.env.PI_BIN || "pi";
  const extensionPath = path.resolve(__dirname, "..", "pi-extension", "index.ts");
  log(
    `Starting pi process with bin=${piBin} PI_CODING_AGENT_DIR=${PI_AGENT_DIR} extension=${extensionPath}`,
  );

  piProcess = spawn(
    piBin,
    ["--mode", "rpc", "--no-extensions", "-e", extensionPath, "--no-tools"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    },
  );

  piProcess.on("spawn", () => {
    log(`pi spawned (pid=${piProcess.pid ?? "unknown"})`);
  });

  piProcess.on("error", (error) => {
    emitBridgeError(`Failed to start pi: ${error.message}`);
  });

  piProcess.on("close", (code, signal) => {
    emitBridgeError(`Pi process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    clearPendingBrowserRequests("Pi process exited");
    process.exit(0);
  });

  const rl = readline.createInterface({ input: piProcess.stdout });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      logMessageFlow("PI->HOST", parsed);
      if (parsed.type === "browser_response" && onBrowserResponse(parsed)) {
        return;
      }
      sendNativeMessage(parsed);
    } catch (error) {
      log(`Invalid JSON from pi stdout: ${String(error)}`);
    }
  });

  piProcess.stderr.on("data", (chunk) => {
    log(`[pi] ${chunk.toString().trimEnd()}`);
  });

  sendNativeMessage({ type: "bridge_status", status: "connected" });
}

function forwardToPi(message) {
  if (message?.type === "list_sessions") {
    try {
      sendNativeMessage({
        type: "response",
        command: "list_sessions",
        success: true,
        data: { sessions: listSessions() },
        id: message.id,
      });
    } catch (error) {
      sendNativeMessage({
        type: "response",
        command: "list_sessions",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        id: message.id,
      });
    }
    return;
  }

  ensurePiProcess();

  if (message?.type === "browser_response") {
    onBrowserResponse(message);
    return;
  }

  if (!piProcess || !piProcess.stdin.writable) {
    emitBridgeError("Pi stdin is not writable");
    return;
  }

  try {
    logMessageFlow("HOST->PI", message);
    piProcess.stdin.write(`${JSON.stringify(message)}\n`);
  } catch (error) {
    emitBridgeError(`Failed to write to pi stdin: ${error.message}`);
  }
}

function processInputBuffer() {
  while (inputBuffer.length >= 4) {
    const messageLength = inputBuffer.readUInt32LE(0);
    if (messageLength > MAX_MESSAGE_SIZE) {
      emitBridgeError(`Incoming native message too large (${messageLength} bytes)`);
      process.exit(1);
      return;
    }

    if (inputBuffer.length < 4 + messageLength) {
      return;
    }

    const payload = inputBuffer.subarray(4, 4 + messageLength);
    inputBuffer = inputBuffer.subarray(4 + messageLength);

    try {
      const message = JSON.parse(payload.toString("utf8"));
      logMessageFlow("BROWSER->HOST", message);
      if (message.type === "browser_response" && onBrowserResponse(message)) {
        continue;
      }
      forwardToPi(message);
    } catch (error) {
      emitBridgeError(`Invalid message from browser: ${error.message}`);
    }
  }
}

function shutdown(signal) {
  log(`Received ${signal}`);
  stopSocketServer();
  clearPendingBrowserRequests(`Native host shutting down (${signal})`);
  if (piProcess) {
    piProcess.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  }
  process.exit(0);
}

log("Native host started");
startSocketServer();

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processInputBuffer();
});

process.stdin.on("end", () => {
  log("Browser disconnected (stdin end)");
  stopSocketServer();
  clearPendingBrowserRequests("Browser disconnected");
  if (piProcess) {
    piProcess.kill();
  }
  process.exit(0);
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
