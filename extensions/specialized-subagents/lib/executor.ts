/**
 * Core subagent executor.
 *
 * Uses createAgentSession from the SDK for all subagent patterns.
 * Supports streaming text updates, tool execution tracking, logging, and usage tracking.
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
import { createRunLogger, generateRunId, type RunLogger } from "./logging";
import type {
  OnTextUpdate,
  OnToolUpdate,
  SubagentConfig,
  SubagentResult,
  SubagentToolCall,
  SubagentUsage,
} from "./types";

/**
 * Execute a subagent with the given configuration.
 *
 * Key features:
 * - Skills support via config.skills
 * - Logging support via config.logging
 * - Cost/usage tracking in result
 * - Returns runId and logFiles paths
 */
export async function executeSubagent(
  config: SubagentConfig,
  userMessage: string,
  ctx: ExtensionContext,
  onTextUpdate?: OnTextUpdate,
  signal?: AbortSignal,
  onToolUpdate?: OnToolUpdate,
): Promise<SubagentResult> {
  let logger: RunLogger | null = null;
  let runId: string;

  // Setup logging if enabled
  if (config.logging?.enabled) {
    try {
      logger = await createRunLogger(
        ctx.cwd,
        config.name,
        config.logging.debug ?? false,
      );
      runId = logger.runId;
    } catch (err) {
      // Log warning but continue without logging
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

  // Track tool execution state to capture only the final response
  let toolsHaveStarted = false;
  let toolsHaveCompleted = false;

  // Usage tracking - accumulate across all turns
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

  // Subscribe to events for streaming output
  const unsubscribe = session.subscribe((event) => {
    // Log raw events if debug logging enabled
    if (logger && config.logging?.debug) {
      logger.logEventRaw(event).catch(() => {});
    }

    // Handle text streaming (ignore thinking deltas)
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        const delta = event.assistantMessageEvent.delta;
        accumulated += delta;

        // Only accumulate final response (after tools complete)
        if (toolsHaveCompleted) {
          finalResponse += delta;
        }

        onTextUpdate?.(delta, accumulated);
        logger?.logTextDelta(delta, accumulated).catch(() => {});
      }
    }

    // Handle tool execution events
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
        // Capture partial result for progress display
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

        // Capture tool cost from result details (e.g., Exa API costs)
        const resultDetails = event.result?.details as
          | { cost?: number }
          | undefined;
        if (resultDetails?.cost !== undefined) {
          usage.toolCost = (usage.toolCost ?? 0) + resultDetails.cost;
        }
      }

      // Check if all tools are now complete
      const allDone = [...toolCalls.values()].every(
        (tc) => tc.status === "done" || tc.status === "error",
      );
      if (allDone) {
        toolsHaveCompleted = true;
      }
    }

    // Capture usage from assistant messages at turn end
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
          // totalCost will be computed at the end (llmCost + toolCost)
        }
      }
    }
  });

  // Handle abort signal
  if (signal) {
    if (signal.aborted) {
      // Already aborted before we started - return immediately
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

  // Use finalResponse if tools were used, otherwise use full accumulated text
  const responseText = toolsHaveStarted ? finalResponse : accumulated;
  const cleanedContent = filterThinkingTags(responseText);

  // Calculate estimated tokens (fallback if real usage not available)
  const totalRealTokens =
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0);
  usage.estimatedTokens =
    totalRealTokens > 0
      ? totalRealTokens
      : Math.round(cleanedContent.length / 4);

  // Compute total cost (LLM + tool costs)
  usage.totalCost = (usage.llmCost ?? 0) + (usage.toolCost ?? 0);

  // Build result
  const result: SubagentResult = {
    content: cleanedContent,
    aborted,
    toolCalls: [...toolCalls.values()],
    error,
    runId,
    usage,
  };

  // Add log file paths if logging was enabled
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
 * Some models leak thinking as text tags even when thinkingLevel is set.
 */
export function filterThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
}
