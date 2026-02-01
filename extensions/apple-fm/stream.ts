import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  calculateCost,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
} from "@mariozechner/pi-ai";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BridgeRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
}

interface BridgeEvent {
  type: "start" | "delta" | "done" | "error";
  content?: string;
  message?: string;
  code?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

function getBinaryPath(): string {
  const candidates = [
    join(__dirname, "bin", "apple-fm-bridge"),
    join(__dirname, "bridge", ".build", "release", "apple-fm-bridge"),
  ];

  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    "apple-fm-bridge binary not found. Build with:\n" +
      "  cd extensions/apple-fm/bridge && swift build -c release\n" +
      "Then copy to bin/:\n" +
      "  cp bridge/.build/release/apple-fm-bridge bin/apple-fm-bridge",
  );
}

function contextToBridgeRequest(
  context: Context,
  options?: SimpleStreamOptions,
): BridgeRequest {
  const messages: BridgeRequest["messages"] = [];

  if (context.systemPrompt) {
    messages.push({ role: "system", content: context.systemPrompt });
  }

  for (const msg of context.messages) {
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n");
      if (text) messages.push({ role: "user", content: text });
    } else if (msg.role === "assistant") {
      const text = msg.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      if (text) messages.push({ role: "assistant", content: text });
    }
    // Tool results are skipped -- not supported by Apple Foundation Models
  }

  return {
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
  };
}

export function streamAppleFM(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      const binaryPath = getBinaryPath();
      const request = contextToBridgeRequest(context, options);

      const proc = spawn(binaryPath, [], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Collect stderr for error reporting
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Handle abort signal
      if (options?.signal) {
        const onAbort = () => proc.kill("SIGTERM");
        options.signal.addEventListener("abort", onAbort, { once: true });
        proc.on("close", () =>
          options.signal?.removeEventListener("abort", onAbort),
        );
      }

      // Write request to stdin
      proc.stdin.write(JSON.stringify(request));
      proc.stdin.end();

      stream.push({ type: "start", partial: output });

      const rl = createInterface({ input: proc.stdout });
      let textStarted = false;
      let isDone = false;

      for await (const line of rl) {
        if (!line.trim()) continue;

        let event: BridgeEvent;
        try {
          event = JSON.parse(line);
        } catch {
          continue; // Skip malformed lines
        }

        switch (event.type) {
          case "start":
            // Already emitted above
            break;

          case "delta": {
            if (!textStarted) {
              output.content.push({ type: "text", text: "" });
              stream.push({
                type: "text_start",
                contentIndex: 0,
                partial: output,
              });
              textStarted = true;
            }

            const block = output.content[0];
            if (block && block.type === "text" && event.content) {
              block.text += event.content;
              stream.push({
                type: "text_delta",
                contentIndex: 0,
                delta: event.content,
                partial: output,
              });
            }
            break;
          }

          case "done": {
            if (textStarted) {
              const block = output.content[0];
              if (block && block.type === "text") {
                stream.push({
                  type: "text_end",
                  contentIndex: 0,
                  content: block.text,
                  partial: output,
                });
              }
            }

            if (event.usage) {
              output.usage.input = event.usage.input_tokens;
              output.usage.output = event.usage.output_tokens;
              output.usage.totalTokens =
                output.usage.input + output.usage.output;
              calculateCost(model, output.usage);
            }

            output.stopReason = "stop";
            stream.push({ type: "done", reason: "stop", message: output });
            stream.end();
            isDone = true;
            break;
          }

          case "error": {
            throw new Error(event.message || "Bridge error");
          }
        }

        if (isDone) break;
      }

      // If the process ended without a done event, wait for exit and report
      if (!isDone) {
        const exitCode = await new Promise<number | null>((resolve) => {
          proc.on("close", resolve);
        });

        const errorMsg = stderr.trim() || `Bridge exited with code ${exitCode}`;
        throw new Error(errorMsg);
      }
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage =
        error instanceof Error ? error.message : String(error);
      stream.push({
        type: "error",
        reason: output.stopReason as "aborted" | "error",
        error: output,
      });
      stream.end();
    }
  })();

  return stream;
}

/**
 * Check if the Apple Foundation Model is available on this system.
 * Runs the bridge binary with --check flag.
 */
export async function checkAvailability(): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    const binaryPath = getBinaryPath();
    return new Promise((resolve) => {
      const proc = spawn(binaryPath, ["--check"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.on("close", () => {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve({ available: false, reason: "Failed to parse check output" });
        }
      });
    });
  } catch {
    return { available: false, reason: "Bridge binary not found" };
  }
}
