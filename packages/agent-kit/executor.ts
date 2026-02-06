/**
 * Core subagent executor.
 *
 * Uses createAgentSession from the SDK for all subagent patterns.
 * Supports streaming text updates, tool execution tracking, and usage tracking.
 * Logging is injectable via the SubagentLogger interface.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { generateRunId } from "./logging/paths";
import type {
  OnTextUpdate,
  OnToolUpdate,
  SubagentConfig,
  SubagentResult,
  SubagentToolCall,
  SubagentUsage,
} from "./types";

/**
 * Injectable logger interface for subagent execution.
 * Implementations can write to files, console, or no-op.
 */
export interface SubagentLogger {
  /** Unique run identifier */
  runId: string;
  /** Path to the human-readable stream log */
  streamPath: string;
  /** Path to the debug JSONL log */
  debugPath: string;
  /** Log a raw event (debug mode only) */
  logEventRaw(event: unknown): Promise<void>;
  /** Log a text delta */
  logTextDelta(delta: string, accumulated: string): Promise<void>;
  /** Log tool execution start */
  logToolStart(toolCall: SubagentToolCall): Promise<void>;
  /** Log tool execution end */
  logToolEnd(toolCall: SubagentToolCall): Promise<void>;
  /** Close the logger */
  close(): Promise<void>;
}

/**
 * Options for creating a subagent logger.
 * Passed to the factory so implementations can set up logging as needed.
 */
export interface CreateLoggerOptions {
  cwd: string;
  name: string;
  debug: boolean;
}

/**
 * Execute a subagent with the given configuration.
 *
 * @param config - Subagent configuration
 * @param userMessage - The user's prompt
 * @param ctx - Extension context
 * @param onTextUpdate - Callback for streaming text
 * @param signal - Abort signal
 * @param onToolUpdate - Callback for tool execution updates
 * @param createLogger - Optional factory to create a logger
 */
export async function executeSubagent(
  config: SubagentConfig,
  userMessage: string,
  ctx: ExtensionContext,
  onTextUpdate?: OnTextUpdate,
  signal?: AbortSignal,
  onToolUpdate?: OnToolUpdate,
  createLogger?: (opts: CreateLoggerOptions) => Promise<SubagentLogger | null>,
): Promise<SubagentResult> {
  let logger: SubagentLogger | null = null;
  let runId: string;

  // Setup logging if enabled
  if (config.logging?.enabled && createLogger) {
    try {
      logger = await createLogger({
        cwd: ctx.cwd,
        name: config.name,
        debug: config.logging.debug ?? false,
      });
      runId = logger?.runId ?? generateRunId(config.name);
    } catch (err) {
      console.warn("Failed to create subagent logger:", err);
      runId = generateRunId(config.name);
    }
  } else {
    runId = generateRunId(config.name);
  }

  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(ctx.cwd, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: ctx.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noSkills: true,
    systemPromptOverride: () => config.systemPrompt,
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    skillsOverride: () => ({
      skills: config.skills ?? [],
      diagnostics: [],
    }),
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    model: config.model,
    tools: config.tools ?? [],
    customTools: config.customTools ?? [],
    sessionManager: SessionManager.inMemory(),
    thinkingLevel: config.thinkingLevel ?? "low",
    modelRegistry: ctx.modelRegistry,
    resourceLoader,
  });

  let accumulated = "";
  let finalResponse = "";
  let aborted = false;
  const toolCalls = new Map<string, SubagentToolCall>();

  let toolsHaveStarted = false;
  let toolsHaveCompleted = false;

  const usage: SubagentUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedTokens: 0,
    llmCost: 0,
    toolCost: 0,
    totalCost: 0,
  };

  const unsubscribe = session.subscribe((event) => {
    if (logger && config.logging?.debug) {
      logger.logEventRaw(event).catch(() => {});
    }

    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        const delta = event.assistantMessageEvent.delta;
        accumulated += delta;

        if (toolsHaveCompleted) {
          finalResponse += delta;
        }

        onTextUpdate?.(delta, accumulated);
        logger?.logTextDelta(delta, accumulated).catch(() => {});
      }
    }

    if (event.type === "tool_execution_start") {
      toolsHaveStarted = true;
      toolsHaveCompleted = false;
      finalResponse = "";
      const toolCall: SubagentToolCall = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args ?? {},
        status: "running",
      };
      toolCalls.set(event.toolCallId, toolCall);
      onToolUpdate?.([...toolCalls.values()]);
      logger?.logToolStart(toolCall).catch(() => {});
    }

    if (event.type === "tool_execution_update") {
      const existing = toolCalls.get(event.toolCallId);
      if (existing) {
        existing.args = event.args ?? existing.args;
        if (event.partialResult) {
          existing.partialResult = event.partialResult as {
            content: Array<{ type: string; text?: string }>;
            details?: unknown;
          };
        }
        onToolUpdate?.([...toolCalls.values()]);
      }
    }

    if (event.type === "tool_execution_end") {
      const existing = toolCalls.get(event.toolCallId);
      if (existing) {
        existing.status = event.isError ? "error" : "done";
        existing.result = event.result;
        if (event.isError && event.result) {
          existing.error =
            typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result);
        }
        onToolUpdate?.([...toolCalls.values()]);
        logger?.logToolEnd(existing).catch(() => {});

        const resultDetails = event.result?.details as
          | { cost?: number }
          | undefined;
        if (resultDetails?.cost !== undefined) {
          usage.toolCost = (usage.toolCost ?? 0) + resultDetails.cost;
        }
      }

      const allDone = [...toolCalls.values()].every(
        (tc) => tc.status === "done" || tc.status === "error",
      );
      if (allDone) {
        toolsHaveCompleted = true;
      }
    }

    if (event.type === "turn_end") {
      const msg = event.message;
      if (msg.role === "assistant") {
        const assistantMsg = msg as AssistantMessage;
        const msgUsage = assistantMsg.usage;
        if (msgUsage) {
          usage.inputTokens = (usage.inputTokens ?? 0) + msgUsage.input;
          usage.outputTokens = (usage.outputTokens ?? 0) + msgUsage.output;
          usage.cacheReadTokens =
            (usage.cacheReadTokens ?? 0) + msgUsage.cacheRead;
          usage.cacheWriteTokens =
            (usage.cacheWriteTokens ?? 0) + msgUsage.cacheWrite;
          usage.llmCost = (usage.llmCost ?? 0) + msgUsage.cost.total;
        }
      }
    }
  });

  if (signal) {
    if (signal.aborted) {
      unsubscribe();
      session.dispose();
      await logger?.close().catch(() => {});
      return {
        content: "",
        aborted: true,
        toolCalls: [],
        runId,
        usage,
      };
    } else {
      signal.addEventListener(
        "abort",
        () => {
          session.abort();
          aborted = true;
        },
        { once: true },
      );
    }
  }

  let error: string | undefined;

  try {
    await session.prompt(userMessage);
  } catch (err) {
    if (signal?.aborted) {
      aborted = true;
    } else {
      error =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
    }
  } finally {
    unsubscribe();
    session.dispose();
    await logger?.close().catch(() => {});
  }

  const responseText = toolsHaveStarted ? finalResponse : accumulated;
  const cleanedContent = filterThinkingTags(responseText);

  const totalRealTokens =
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0);
  usage.estimatedTokens =
    totalRealTokens > 0
      ? totalRealTokens
      : Math.round(cleanedContent.length / 4);

  usage.totalCost = (usage.llmCost ?? 0) + (usage.toolCost ?? 0);

  const result: SubagentResult = {
    content: cleanedContent,
    aborted,
    toolCalls: [...toolCalls.values()],
    error,
    runId,
    usage,
  };

  if (logger) {
    result.logFiles = {
      stream: logger.streamPath,
      debug: logger.debugPath,
    };
  }

  return result;
}

/**
 * Filter out <thinking>...</thinking> tags from text.
 */
export function filterThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
}
