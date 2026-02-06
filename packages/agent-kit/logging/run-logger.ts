import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SubagentLogger } from "../executor";
import type { SubagentToolCall } from "../types";
import { generateRunId, getLogDirectory } from "./paths";

function formatTimestamp(): string {
  const now = new Date();
  return `${now.toTimeString().split(" ")[0]}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

class RunLoggerImpl implements SubagentLogger {
  public readonly runId: string;
  public readonly streamPath: string;
  public readonly debugPath: string;

  private streamHandle: fs.FileHandle | null = null;
  private debugHandle: fs.FileHandle | null = null;
  private enableDebug: boolean;
  private lastTextLength = 0;

  constructor(runId: string, logDir: string, enableDebug: boolean) {
    this.runId = runId;
    this.streamPath = path.join(logDir, "stream.log");
    this.debugPath = path.join(logDir, "debug.jsonl");
    this.enableDebug = enableDebug;
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.streamPath);
    await fs.mkdir(dir, { recursive: true });
    this.streamHandle = await fs.open(this.streamPath, "a");
    if (this.enableDebug) {
      this.debugHandle = await fs.open(this.debugPath, "a");
    }
    await this.writeStream(`[${formatTimestamp()}] Starting subagent\n`);
  }

  async logTextDelta(_delta: string, accumulated: string): Promise<void> {
    if (this.lastTextLength === 0 && accumulated.trim().length > 0) {
      await this.writeStream(`[${formatTimestamp()}] Response:\n`);
    }
    this.lastTextLength = accumulated.length;
  }

  async logToolStart(call: SubagentToolCall): Promise<void> {
    const argsStr =
      Object.keys(call.args).length > 0
        ? ` ${JSON.stringify(call.args).slice(0, 100)}`
        : "";
    await this.writeStream(
      `[${formatTimestamp()}] Tool: ${call.toolName}${argsStr}\n`,
    );
  }

  async logToolEnd(call: SubagentToolCall): Promise<void> {
    const status = call.status === "error" ? "error" : "completed";
    const errorSuffix = call.error ? ` - ${call.error.slice(0, 100)}` : "";
    await this.writeStream(
      `[${formatTimestamp()}] Tool: ${call.toolName} ${status}${errorSuffix}\n`,
    );
  }

  async logEventRaw(event: unknown): Promise<void> {
    if (this.debugHandle) {
      await this.debugHandle.write(`${JSON.stringify(event)}\n`);
    }
  }

  async close(): Promise<void> {
    await this.writeStream(`[${formatTimestamp()}] Subagent finished\n`);
    try {
      await this.streamHandle?.close();
    } catch {
      /* best effort */
    }
    try {
      await this.debugHandle?.close();
    } catch {
      /* best effort */
    }
    this.streamHandle = null;
    this.debugHandle = null;
  }

  private async writeStream(content: string): Promise<void> {
    if (this.streamHandle) {
      await this.streamHandle.write(content);
    }
  }
}

/**
 * Create a run logger for a subagent execution.
 * Returns a SubagentLogger that writes to ~/.pi/agent/subagents/...
 */
export async function createRunLogger(
  cwd: string,
  subagentName: string,
  enableDebug: boolean,
): Promise<SubagentLogger> {
  const runId = generateRunId(subagentName);
  const logDir = getLogDirectory(cwd, subagentName, runId);
  const logger = new RunLoggerImpl(runId, logDir, enableDebug);
  await logger.init();
  return logger;
}
