/**
 * Read Session tool - extract information from a past session using a Gemini Flash subagent.
 *
 * The subagent gets access to session-specific tools (get_session_overview, get_messages, etc.)
 * and uses them to extract information based on a goal.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FailedToolCalls,
  MarkdownResponse,
  renderToolTextFallback,
  SubagentFooter,
  type ToolCallFormatter,
  ToolCallHeader,
  ToolCallList,
  ToolCallSummary,
  ToolDetails,
  type ToolDetailsField,
} from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  createExecutionTimer,
  wrapToolDefinitionsWithTiming,
} from "../../../packages/agent-kit";
import {
  executeSubagent,
  resolveModel,
  type SubagentToolCall,
  shouldFailToolCallForModelIssue,
} from "../../subagents/lib";
import {
  createSessionTools,
  loadSession,
  type ParsedSession,
} from "../lib/session-reader";
import { getSessionsDir } from "../lib/session-search";
import type { ReadSessionDetails } from "./read-session-types";

const MODEL = "google/gemini-2.0-flash-001";

const SYSTEM_PROMPT = `You are a session analyzer. Your task is to extract specific information from a Pi coding agent session.

You have access to tools that let you query the session:
- \`get_session_overview\`: Get basic session metadata
- \`get_messages\`: Paginate through messages (user or assistant)
- \`get_tool_calls\`: Look at specific tool calls
- \`get_tool_results\`: Look at tool results
- \`get_compactions\`: See session compactions
- \`find_messages\`: Search for messages by keyword

Guidelines:
1. Always start with \`get_session_overview\` to understand the session
2. Always begin your response with a brief header: session name (if available), working directory, and date
3. For keyword-based goals, use \`find_messages\` first
4. Use \`get_compactions\` to understand session history and context
5. Paginate through results using offset/limit - never request everything at once
6. Focus only on extracting what's relevant to the goal
7. Respond in markdown with clear, concise extraction
8. Be specific: quote relevant snippets or summarize findings
9. Include the list of tools used in the session (from toolNames in overview) when relevant to the goal`;

/**
 * Resolve a session ID (UUID or path) to an absolute file path.
 * Returns null if not found.
 */
function resolveSessionPath(sessionId: string): string | null {
  // If it looks like a path, use it directly
  if (sessionId.includes("/") || sessionId.endsWith(".jsonl")) {
    return sessionId;
  }

  // Otherwise, search for UUID in session filenames
  const sessionsDir = getSessionsDir();

  try {
    const cwdDirs = readdirSync(sessionsDir);

    for (const cwdDir of cwdDirs) {
      const cwdPath = join(sessionsDir, cwdDir);
      const stat = statSync(cwdPath);

      if (!stat.isDirectory()) continue;

      try {
        const files = readdirSync(cwdPath);

        for (const file of files) {
          if (file.includes(sessionId) && file.endsWith(".jsonl")) {
            return join(cwdPath, file);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // Skip errors reading sessions dir
  }

  return null;
}

const parameters = Type.Object({
  sessionId: Type.String({
    description: "Session UUID or file path",
  }),
  goal: Type.String({
    description: "What information to extract from the session",
  }),
});

type ReadSessionInputType = {
  sessionId: string;
  goal: string;
};

export const READ_SESSION_GUIDANCE = `
## read_session

Use read_session to extract specific information from a past session identified by find_sessions.

**When to use:**
- User wants to recall what was decided in a previous session
- User needs details extracted from a past conversation
- Following up after find_sessions located the relevant session

**When NOT to use:**
- The current session already has the needed context
- You haven't identified which session to read yet (use find_sessions first)
`;

/**
 * Setup the read_session tool.
 */
export function setupReadSessionTool(pi: ExtensionAPI) {
  pi.registerTool<typeof parameters, ReadSessionDetails>({
    name: "read_session",
    label: "Read Session",
    description: `Extract specific information from a past Pi coding session.

The tool spins up a subagent that uses session-specific tools to analyze a session file based on your goal.

Examples:
- Goal: "What was the main issue discussed?"
- Goal: "List all tool calls made during this session"
- Goal: "Find where we discussed authentication"
- Goal: "Summarize the final solution implemented"

Input the session ID (UUID or path) and what you want to learn about it.`,

    parameters,

    async execute(
      _toolCallId: string,
      args: ReadSessionInputType,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<ReadSessionDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const { sessionId, goal } = args;
      const executionTimer = createExecutionTimer();

      let resolvedPath: string | null = null;
      let resolvedModel: { provider: string; id: string } | undefined;
      let currentToolCalls: SubagentToolCall[] = [];

      // Resolve session path
      resolvedPath = resolveSessionPath(sessionId);

      if (!resolvedPath) {
        const error = `Session not found: ${sessionId}`;
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          details: {
            sessionId,
            goal,
            resolvedPath: undefined,
            toolCalls: [],
            error,
            totalDurationMs: executionTimer.getDurationMs(),
          },
        };
      }

      // Load session
      let session: ParsedSession;
      try {
        session = loadSession(resolvedPath);
      } catch (err) {
        const error =
          err instanceof Error ? err.message : `Failed to load session`;
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          details: {
            sessionId,
            goal,
            resolvedPath,
            toolCalls: [],
            error,
            totalDurationMs: executionTimer.getDurationMs(),
          },
        };
      }

      // Create session tools
      const sessionTools = wrapToolDefinitionsWithTiming(
        createSessionTools(session),
      );

      try {
        const model = resolveModel("openrouter", MODEL, ctx);
        resolvedModel = { provider: model.provider, id: model.id };

        // Publish resolved model early
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: {
            sessionId,
            goal,
            resolvedPath,
            toolCalls: currentToolCalls,
            resolvedModel,
          },
        });

        const userMessage = `Please analyze this session and help me with the following goal:\n\n${goal}`;

        const result = await executeSubagent(
          {
            name: "read_session",
            model,
            systemPrompt: SYSTEM_PROMPT,
            customTools: sessionTools,
            thinkingLevel: "off",
            logging: {
              enabled: true,
              debug: false,
            },
          },
          userMessage,
          ctx,
          // onTextUpdate
          (_delta, _accumulated) => {
            onUpdate?.({
              content: [{ type: "text", text: "" }],
              details: {
                sessionId,
                goal,
                resolvedPath,
                toolCalls: currentToolCalls,
                resolvedModel,
              },
            });
          },
          signal,
          // onToolUpdate
          (toolCalls: SubagentToolCall[]) => {
            currentToolCalls = toolCalls;
            onUpdate?.({
              content: [{ type: "text", text: "" }],
              details: {
                sessionId,
                goal,
                resolvedPath,
                toolCalls: currentToolCalls,
                resolvedModel,
              },
            });
          },
        );

        const finalToolCalls =
          result.toolCalls.length > 0 ? result.toolCalls : currentToolCalls;

        if (result.aborted) {
          return {
            content: [{ type: "text", text: "Aborted" }],
            details: {
              sessionId,
              goal,
              resolvedPath,
              toolCalls: finalToolCalls,

              aborted: true,
              usage: result.usage,
              resolvedModel,
              totalDurationMs: result.totalDurationMs,
            },
          };
        }

        if (result.error) {
          if (shouldFailToolCallForModelIssue(result)) {
            throw new Error(result.error);
          }

          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            details: {
              sessionId,
              goal,
              resolvedPath,
              toolCalls: finalToolCalls,

              error: result.error,
              usage: result.usage,
              resolvedModel,
              totalDurationMs: result.totalDurationMs,
            },
          };
        }

        // Check if all tool calls failed
        const errorCount = finalToolCalls.filter(
          (tc) => tc.status === "error",
        ).length;
        const allFailed =
          finalToolCalls.length > 0 && errorCount === finalToolCalls.length;

        if (allFailed) {
          const error = "All tool calls failed";
          return {
            content: [{ type: "text", text: `Error: ${error}` }],
            details: {
              sessionId,
              goal,
              resolvedPath,
              toolCalls: finalToolCalls,

              error,
              usage: result.usage,
              resolvedModel,
              totalDurationMs: result.totalDurationMs,
            },
          };
        }

        return {
          content: [{ type: "text", text: result.content }],
          details: {
            sessionId,
            goal,
            resolvedPath,
            toolCalls: finalToolCalls,
            response: result.content,
            usage: result.usage,
            resolvedModel,
            totalDurationMs: result.totalDurationMs,
          },
        };
      } finally {
      }
    },

    renderCall(args: ReadSessionInputType, theme: Theme) {
      const goal = args.goal.trim();
      const shortGoal = goal.length > 80 ? `${goal.slice(0, 77)}...` : goal;

      return new ToolCallHeader(
        {
          toolName: "Read Session",
          mainArg: args.sessionId,
          optionArgs:
            goal.length <= 80
              ? [{ label: "goal", value: shortGoal }]
              : undefined,
          longArgs:
            goal.length > 80
              ? [
                  {
                    label: "goal",
                    value: goal,
                  },
                ]
              : undefined,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<ReadSessionDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const { details } = result;

      // Fallback if details missing
      if (!details) {
        return renderToolTextFallback(result, theme);
      }

      const {
        toolCalls,
        response,
        aborted,
        error,
        usage,
        resolvedModel,
        totalDurationMs,
      } = details;

      const footer = new SubagentFooter(theme, {
        resolvedModel,
        usage,
        toolCalls,
        totalDurationMs,
      });

      // Build fields based on state
      const fields: ToolDetailsField[] = [];

      if (aborted) {
        fields.push({ label: "Status", value: "Aborted" });
      } else if (error) {
        fields.push({ label: "Error", value: error });
      } else if (response) {
        // Done state
        fields.push(new ToolCallSummary(toolCalls, toolCallFormatter, theme));
        fields.push(new FailedToolCalls(toolCalls, toolCallFormatter, theme));
        fields.push(new MarkdownResponse(response, theme));
      } else {
        // Running state
        fields.push(new ToolCallList(toolCalls, toolCallFormatter, theme));
      }

      return new ToolDetails({ fields, footer }, options, theme);
    },
  });
}

/**
 * Tool call formatter for read_session subagent tools.
 */
const toolCallFormatter: ToolCallFormatter<SubagentToolCall> = (
  tc: SubagentToolCall,
) => {
  const { toolName, args } = tc;

  let formatted: { label: string; detail?: string };

  // Format tool calls by name
  switch (toolName) {
    case "get_session_overview":
      formatted = { label: "Overview" };
      break;

    case "get_messages": {
      const role = args.role ? ` (${args.role})` : "";
      const limit = args.limit ? ` - ${args.limit} items` : "";
      formatted = { label: "Messages", detail: `${role}${limit}` };
      break;
    }

    case "get_tool_calls": {
      const name = args.toolName ? String(args.toolName) : "unknown";
      formatted = { label: "Tool Calls", detail: name };
      break;
    }

    case "get_tool_results": {
      const name = args.toolName ? String(args.toolName) : "unknown";
      formatted = { label: "Tool Results", detail: name };
      break;
    }

    case "get_compactions":
      formatted = { label: "Compactions" };
      break;

    case "find_messages": {
      const query = args.query ? ` "${String(args.query).slice(0, 30)}"` : "";
      formatted = { label: "Find", detail: query };
      break;
    }

    default:
      formatted = { label: toolName };
      break;
  }

  return appendDurationToDetail(formatted, tc.durationMs);
};

function appendDurationToDetail(
  formatted: { label: string; detail?: string },
  durationMs?: number,
): { label: string; detail?: string } {
  if (durationMs === undefined) return formatted;

  const duration = formatDuration(durationMs);
  return {
    ...formatted,
    detail: formatted.detail ? `${formatted.detail} · ${duration}` : duration,
  };
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}
