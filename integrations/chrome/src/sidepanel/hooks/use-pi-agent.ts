import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BridgeStatusMessage,
  type ConnectionStatusMessage,
  SIDEPANEL_PORT_NAME,
} from "@/common/constants";
import type { RpcCommand, RpcEvent, RpcResponse } from "@/common/pi-rpc-types";
import type {
  AssistantSegment,
  AvailableModel,
  ExtensionUIRequest,
  ModelInfo,
  NotificationItem,
  PiAgentState,
  SessionStats,
  SessionSummary,
  ToolExecution,
  UiMessage,
  WidgetEntry,
} from "../types";

const newId = () => `${Date.now()}-${crypto.randomUUID()}`;

const extractContent = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return typeof (block as { text: unknown }).text === "string"
            ? (block as { text: string }).text
            : "";
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const summarize = (value: unknown): string => {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getTextContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) {
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
};

function asModel(model: unknown): ModelInfo | null {
  if (!model || typeof model !== "object") return null;
  const provider = (model as Record<string, unknown>).provider;
  const id =
    (model as Record<string, unknown>).id ??
    (model as Record<string, unknown>).modelId;
  if (typeof provider !== "string" || typeof id !== "string") {
    return null;
  }
  return { provider, id };
}

function asAvailableModels(value: unknown): AvailableModel[] {
  if (!value || typeof value !== "object") return [];
  const models = (value as Record<string, unknown>).models;
  if (!Array.isArray(models)) return [];

  const parsed: AvailableModel[] = [];

  for (const item of models) {
    if (!item || typeof item !== "object") continue;
    const model = item as Record<string, unknown>;
    const provider = model.provider;
    const id = model.id ?? model.modelId;
    if (typeof provider !== "string" || typeof id !== "string") {
      continue;
    }

    const next: AvailableModel = { provider, id };
    if (typeof model.displayName === "string") {
      next.displayName = model.displayName;
    } else if (typeof model.name === "string") {
      next.displayName = model.name;
    }
    if (typeof model.supportsThinking === "boolean") {
      next.supportsThinking = model.supportsThinking;
    } else if (typeof model.reasoning === "boolean") {
      next.supportsThinking = model.reasoning;
    }

    parsed.push(next);
  }

  return parsed;
}

function asSessionStats(value: unknown): SessionStats | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const tokensRaw = data.tokens;
  if (!tokensRaw || typeof tokensRaw !== "object") return null;
  const tokens = tokensRaw as Record<string, unknown>;

  const toNumber = (v: unknown) => (typeof v === "number" ? v : 0);
  const toOptionalNumber = (v: unknown) =>
    typeof v === "number" ? v : undefined;

  const contextUsage =
    data.contextUsage && typeof data.contextUsage === "object"
      ? (data.contextUsage as Record<string, unknown>)
      : null;

  const contextPercent =
    toOptionalNumber(data.contextPercent) ??
    toOptionalNumber(data.contextPercentage) ??
    toOptionalNumber(contextUsage?.percent) ??
    toOptionalNumber(contextUsage?.percentage);

  const contextWindow =
    toOptionalNumber(data.contextWindow) ??
    toOptionalNumber(data.contextWindowTokens) ??
    toOptionalNumber(data.maxContextTokens) ??
    toOptionalNumber(contextUsage?.window) ??
    toOptionalNumber(contextUsage?.contextWindow);

  return {
    userMessages: toNumber(data.userMessages),
    assistantMessages: toNumber(data.assistantMessages),
    toolCalls: toNumber(data.toolCalls),
    toolResults: toNumber(data.toolResults),
    totalMessages: toNumber(data.totalMessages),
    tokens: {
      input: toNumber(tokens.input),
      output: toNumber(tokens.output),
      cacheRead: toNumber(tokens.cacheRead),
      cacheWrite: toNumber(tokens.cacheWrite),
      total: toNumber(tokens.total),
    },
    cost: toNumber(data.cost),
    contextPercent,
    contextWindow,
  };
}

function asSessionSummaries(value: unknown): SessionSummary[] {
  if (!value || typeof value !== "object") return [];
  const sessions = (value as Record<string, unknown>).sessions;
  if (!Array.isArray(sessions)) return [];

  const parsed: SessionSummary[] = [];

  for (const entry of sessions) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const sessionPath = item.sessionPath;
    if (typeof sessionPath !== "string" || !sessionPath) continue;

    const next: SessionSummary = { sessionPath };
    if (typeof item.sessionName === "string") {
      next.sessionName = item.sessionName;
    }
    if (typeof item.updatedAt === "number") {
      next.updatedAt = item.updatedAt;
    }
    if (typeof item.messageCount === "number") {
      next.messageCount = item.messageCount;
    }

    parsed.push(next);
  }

  return parsed;
}

function buildAutoTitle(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New session";
  if (cleaned.length <= 52) return cleaned;
  return `${cleaned.slice(0, 49).trim()}...`;
}

function toUiMessagesFromHistory(value: unknown): UiMessage[] {
  if (!value || typeof value !== "object") return [];
  const messages = (value as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return [];

  const out: UiMessage[] = [];
  const toolCallIndexById = new Map<
    string,
    { messageIndex: number; toolIndex: number }
  >();

  for (const entry of messages) {
    if (!entry || typeof entry !== "object") continue;
    const msg = entry as Record<string, unknown>;
    const role = msg.role;

    if (role === "user") {
      const text = getTextContent(msg.content).trim();
      if (!text) continue;
      out.push({
        id: typeof msg.id === "string" ? msg.id : newId(),
        role: "user",
        timestamp: Date.now(),
        text,
        thinking: "",
        toolCalls: [],
        segments: [],
        isStreaming: false,
      });
      continue;
    }

    if (role === "assistant") {
      const content = Array.isArray(msg.content) ? msg.content : [];
      const segments: AssistantSegment[] = [];
      const toolCalls: ToolExecution[] = [];
      let text = "";
      let thinking = "";

      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const part = block as Record<string, unknown>;
        const type = part.type;

        if (type === "thinking" && typeof part.thinking === "string") {
          thinking += part.thinking;
          segments.push({
            id: newId(),
            kind: "thinking",
            text: part.thinking,
            isStreaming: false,
            startedAt: Date.now(),
            endedAt: Date.now(),
          });
          continue;
        }

        if (type === "text" && typeof part.text === "string") {
          text += part.text;
          segments.push({
            id: newId(),
            kind: "text",
            text: part.text,
            isStreaming: false,
            startedAt: Date.now(),
            endedAt: Date.now(),
          });
          continue;
        }

        if (type === "toolCall" && typeof part.id === "string") {
          const args =
            part.arguments && typeof part.arguments === "object"
              ? (part.arguments as Record<string, unknown>)
              : {};
          const tool: ToolExecution = {
            id: newId(),
            toolCallId: part.id,
            toolName: typeof part.name === "string" ? part.name : "tool",
            args,
            status: "running",
            startedAt: Date.now(),
          };
          const toolIndex = toolCalls.push(tool) - 1;
          segments.push({ id: newId(), kind: "tool", toolCallId: part.id });
          toolCallIndexById.set(part.id, {
            messageIndex: out.length,
            toolIndex,
          });
        }
      }

      if (!text && !thinking && toolCalls.length === 0) {
        continue;
      }

      out.push({
        id: typeof msg.id === "string" ? msg.id : newId(),
        role: "assistant",
        timestamp: Date.now(),
        text: text.trim(),
        thinking: thinking.trim(),
        toolCalls,
        segments,
        isStreaming: false,
      });
      continue;
    }

    if (role === "toolResult") {
      const toolCallId =
        typeof msg.toolCallId === "string" ? msg.toolCallId : undefined;
      if (!toolCallId) continue;
      const target = toolCallIndexById.get(toolCallId);
      if (!target) continue;

      const toolMessage = out[target.messageIndex];
      if (!toolMessage || toolMessage.role !== "assistant") continue;

      const updated = [...toolMessage.toolCalls];
      const current = updated[target.toolIndex];
      if (!current) continue;

      const content = extractContent(msg.content);
      updated[target.toolIndex] = {
        ...current,
        status: msg.isError === true ? "error" : "done",
        result: msg.isError === true ? undefined : content,
        error:
          msg.isError === true ? content || "Tool execution failed" : undefined,
        endedAt: Date.now(),
      };

      out[target.messageIndex] = {
        ...toolMessage,
        toolCalls: updated,
      };
    }
  }

  return out;
}

export function usePiAgent() {
  const [state, setState] = useState<PiAgentState>({
    messages: [],
    isStreaming: false,
    isConnected: false,
    bridgeStatus: "disconnected",
    currentModel: null,
    availableModels: [],
    canRetryBridge: false,
    sessions: [],
    isLoadingSessions: false,
    sessionStats: null,
    isLoadingStats: false,
    isCompacting: false,
    activeDialog: null,
    notifications: [],
    statusEntries: [],
    widgets: [],
    editorPrefill: null,
  });

  const stateRef = useRef(state);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const toolInputByCallRef = useRef<
    Map<string, { toolName: string; args: Record<string, unknown> }>
  >(new Map());
  const pendingStatsRequestRef = useRef(false);
  const firstUserMessageRef = useRef<string | null>(null);
  const didAutoTitleRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateCurrentAssistant = useCallback(
    (updater: (msg: UiMessage) => UiMessage) => {
      setState((prev) => {
        const id = currentAssistantIdRef.current;
        if (!id) return prev;
        const idx = prev.messages.findIndex((m) => m.id === id);
        if (idx === -1) return prev;
        const updated = [...prev.messages];
        updated[idx] = updater(updated[idx]);
        return { ...prev, messages: updated };
      });
    },
    [],
  );

  const pushAssistantText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: UiMessage = {
      id: newId(),
      role: "assistant",
      timestamp: Date.now(),
      text: trimmed,
      thinking: "",
      toolCalls: [],
      segments: [
        {
          id: newId(),
          kind: "text",
          text: trimmed,
          isStreaming: false,
          startedAt: Date.now(),
          endedAt: Date.now(),
        },
      ],
      isStreaming: false,
    };
    setState((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
  }, []);

  const send = useCallback((command: RpcCommand) => {
    portRef.current?.postMessage(command);
  }, []);

  const requestSessionStats = useCallback(() => {
    if (stateRef.current.isStreaming) {
      pendingStatsRequestRef.current = true;
      return;
    }
    setState((prev) => ({
      ...prev,
      isLoadingStats: true,
      statsError: undefined,
    }));
    send({ type: "get_session_stats" });
  }, [send]);

  const listSessions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoadingSessions: true,
      sessionError: undefined,
    }));
    send({ type: "list_sessions" });
  }, [send]);

  const handleResponse = useCallback(
    (event: RpcResponse) => {
      if (!event.success) {
        if (event.command === "list_sessions") {
          setState((prev) => ({
            ...prev,
            isLoadingSessions: false,
            sessionError: event.error || "Failed to load sessions",
          }));
          return;
        }
        if (event.command === "get_session_stats") {
          setState((prev) => ({
            ...prev,
            isLoadingStats: false,
            statsError: event.error || "Failed to load stats",
          }));
          return;
        }
        pushAssistantText(event.error || `${event.command} failed`);
        return;
      }

      if (event.command === "get_state") {
        const data = event.data as Record<string, unknown> | undefined;
        if (!data) return;
        const currentModel = asModel(data.model);
        const sessionName = data.sessionName;
        const sessionFile = data.sessionFile;
        const thinkingLevel = data.thinkingLevel;
        const messageCount = data.messageCount;
        const pendingMessageCount = data.pendingMessageCount;

        setState((prev) => ({
          ...prev,
          currentModel,
          sessionName:
            typeof sessionName === "string" ? sessionName : prev.sessionName,
          sessionFile:
            typeof sessionFile === "string" ? sessionFile : prev.sessionFile,
          thinkingLevel:
            typeof thinkingLevel === "string"
              ? thinkingLevel
              : prev.thinkingLevel,
          messageCount:
            typeof messageCount === "number" ? messageCount : prev.messageCount,
          pendingMessageCount:
            typeof pendingMessageCount === "number"
              ? pendingMessageCount
              : prev.pendingMessageCount,
        }));
        return;
      }

      if (event.command === "get_messages") {
        const messages = toUiMessagesFromHistory(event.data);
        setState((prev) => ({
          ...prev,
          messages,
        }));
        return;
      }

      if (event.command === "get_available_models") {
        const models = asAvailableModels(event.data);
        setState((prev) => ({ ...prev, availableModels: models }));
        return;
      }

      if (event.command === "set_model") {
        const next = asModel(event.data);
        if (next) {
          setState((prev) => ({ ...prev, currentModel: next }));
        }
        return;
      }

      if (event.command === "cycle_thinking_level") {
        const data = event.data as Record<string, unknown> | undefined;
        const level = data?.level;
        if (typeof level === "string") {
          setState((prev) => ({ ...prev, thinkingLevel: level }));
          pushAssistantText(`Thinking level: ${level}`);
        }
        return;
      }

      if (event.command === "get_commands") {
        return;
      }

      if (event.command === "get_session_stats") {
        const stats = asSessionStats(event.data);
        setState((prev) => ({
          ...prev,
          sessionStats: stats,
          isLoadingStats: false,
          statsError: stats ? undefined : "Invalid session stats payload",
        }));
        return;
      }

      if (event.command === "list_sessions") {
        const sessions = asSessionSummaries(event.data);
        setState((prev) => ({
          ...prev,
          sessions,
          isLoadingSessions: false,
          sessionError: undefined,
        }));
        return;
      }

      if (
        event.command === "new_session" ||
        event.command === "switch_session"
      ) {
        didAutoTitleRef.current = false;
        firstUserMessageRef.current = null;
        setState((prev) => ({ ...prev, messages: [] }));
        send({ type: "get_state" });
        send({ type: "get_messages" });
        requestSessionStats();
        listSessions();
      }
    },
    [listSessions, pushAssistantText, requestSessionStats, send],
  );

  const handleEvent = useCallback(
    (event: RpcEvent | BridgeStatusMessage | ConnectionStatusMessage) => {
      if (event.type === "bridge_status") {
        setState((prev) => ({
          ...prev,
          bridgeStatus: event.status,
          bridgeError: event.error,
          bridgeReconnectAttempt: event.reconnectAttempt,
          bridgeReconnectMax: event.reconnectMax,
          canRetryBridge: event.canRetry === true,
          isConnected: event.status === "connected",
        }));
        return;
      }

      if (event.type === "connection_status") {
        setState((prev) => ({ ...prev, isConnected: event.connected }));
        return;
      }

      switch (event.type) {
        case "agent_start":
          toolInputByCallRef.current.clear();
          currentAssistantIdRef.current = null;
          setState((prev) => ({ ...prev, isStreaming: true }));
          break;

        case "agent_end":
          updateCurrentAssistant((msg) => {
            const now = Date.now();
            const segments = msg.segments.map((seg) => {
              if (seg.kind === "thinking" && seg.isStreaming) {
                return {
                  ...seg,
                  isStreaming: false,
                  endedAt: now,
                  durationMs: now - seg.startedAt,
                };
              }
              if (seg.kind === "text" && seg.isStreaming) {
                return { ...seg, isStreaming: false, endedAt: now };
              }
              return seg;
            });
            return { ...msg, segments, isStreaming: false };
          });
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            activeDialog: null,
          }));
          if (pendingStatsRequestRef.current) {
            pendingStatsRequestRef.current = false;
            requestSessionStats();
          }
          break;

        case "turn_end":
          if (pendingStatsRequestRef.current) {
            pendingStatsRequestRef.current = false;
            requestSessionStats();
          }
          break;

        case "message_start":
          if (event.message?.role === "assistant") {
            const id = newId();
            const newMsg: UiMessage = {
              id,
              role: "assistant",
              timestamp: Date.now(),
              text: "",
              thinking: "",
              toolCalls: [],
              segments: [],
              isStreaming: true,
            };
            currentAssistantIdRef.current = id;
            setState((prev) => ({
              ...prev,
              messages: [...prev.messages, newMsg],
            }));
          }
          break;

        case "message_update": {
          const ame = event.assistantMessageEvent;
          const updateType = ame.type;
          const delta = ame.delta;

          if (updateType === "thinking_delta" && typeof delta === "string") {
            updateCurrentAssistant((msg) => {
              const segs = [...msg.segments];
              const last = segs[segs.length - 1];
              if (last?.kind === "thinking" && last.isStreaming) {
                segs[segs.length - 1] = { ...last, text: last.text + delta };
              } else {
                const newSeg: AssistantSegment = {
                  id: newId(),
                  kind: "thinking",
                  text: delta,
                  isStreaming: true,
                  startedAt: Date.now(),
                };
                segs.push(newSeg);
              }
              return { ...msg, segments: segs, thinking: msg.thinking + delta };
            });
          }

          if (updateType === "thinking_end") {
            updateCurrentAssistant((msg) => {
              const now = Date.now();
              const segments = msg.segments.map((seg) => {
                if (seg.kind === "thinking" && seg.isStreaming) {
                  return {
                    ...seg,
                    isStreaming: false,
                    endedAt: now,
                    durationMs: now - seg.startedAt,
                  };
                }
                return seg;
              });
              return { ...msg, segments };
            });
          }

          if (updateType === "text_delta" && typeof delta === "string") {
            updateCurrentAssistant((msg) => {
              const segs = [...msg.segments];
              const last = segs[segs.length - 1];
              if (last?.kind === "text" && last.isStreaming) {
                segs[segs.length - 1] = { ...last, text: last.text + delta };
              } else {
                const newSeg: AssistantSegment = {
                  id: newId(),
                  kind: "text",
                  text: delta,
                  isStreaming: true,
                  startedAt: Date.now(),
                };
                segs.push(newSeg);
              }
              return { ...msg, segments: segs, text: msg.text + delta };
            });
          }

          if (updateType === "toolcall_end") {
            const toolCallId = ame.toolCallId;
            const toolName = ame.toolName;
            const input = ame.input;
            if (typeof toolCallId === "string") {
              toolInputByCallRef.current.set(toolCallId, {
                toolName: typeof toolName === "string" ? toolName : "",
                args:
                  input && typeof input === "object"
                    ? (input as Record<string, unknown>)
                    : {},
              });
            }
          }

          break;
        }

        case "message_end": {
          if (event.message.role !== "assistant") break;

          const finalText = getTextContent(event.message.content).trim();

          updateCurrentAssistant((msg) => {
            const now = Date.now();
            const segments = msg.segments.map((seg) => {
              if (seg.kind === "text" && seg.isStreaming) {
                return {
                  ...seg,
                  isStreaming: false,
                  endedAt: now,
                  text: finalText || seg.text,
                };
              }
              if (seg.kind === "thinking" && seg.isStreaming) {
                return {
                  ...seg,
                  isStreaming: false,
                  endedAt: now,
                  durationMs: now - seg.startedAt,
                };
              }
              return seg;
            });
            return {
              ...msg,
              segments,
              text: finalText || msg.text,
              isStreaming: false,
            };
          });

          const currentState = stateRef.current;
          if (!currentState.sessionName && !didAutoTitleRef.current) {
            const firstUser = firstUserMessageRef.current;
            if (firstUser && !firstUser.startsWith("/")) {
              didAutoTitleRef.current = true;
              send({
                type: "set_session_name",
                name: buildAutoTitle(firstUser),
              });
              setTimeout(() => send({ type: "get_state" }), 100);
            }
          }
          break;
        }

        case "tool_execution_start": {
          const stored = toolInputByCallRef.current.get(event.toolCallId);
          const tool: ToolExecution = {
            id: newId(),
            toolCallId: event.toolCallId,
            toolName: stored?.toolName ?? event.toolName,
            args: stored?.args ?? event.args,
            status: "running",
            startedAt: Date.now(),
          };
          const segId = newId();
          updateCurrentAssistant((msg) => ({
            ...msg,
            toolCalls: [...msg.toolCalls, tool],
            segments: [
              ...msg.segments,
              { id: segId, kind: "tool", toolCallId: event.toolCallId },
            ],
          }));
          break;
        }

        case "tool_execution_update": {
          const partial = extractContent(event.partialResult?.content);
          updateCurrentAssistant((msg) => ({
            ...msg,
            toolCalls: msg.toolCalls.map((t) =>
              t.toolCallId !== event.toolCallId
                ? t
                : { ...t, partialOutput: partial },
            ),
          }));
          break;
        }

        case "tool_execution_end": {
          updateCurrentAssistant((msg) => ({
            ...msg,
            toolCalls: msg.toolCalls.map((t) => {
              if (t.toolCallId !== event.toolCallId) return t;
              return {
                ...t,
                status: event.isError ? ("error" as const) : ("done" as const),
                result: event.isError
                  ? undefined
                  : extractContent(event.result.content ?? event.result),
                error: event.isError
                  ? extractContent(event.result.error) ||
                    summarize(event.result.error ?? "Tool execution failed")
                  : undefined,
                endedAt: Date.now(),
              };
            }),
          }));
          toolInputByCallRef.current.delete(event.toolCallId);
          break;
        }

        case "auto_compaction_start":
          setState((prev) => ({
            ...prev,
            isCompacting: true,
            compactionSummary: undefined,
          }));
          break;

        case "auto_compaction_end": {
          const resultText = summarize(event.result);
          setState((prev) => ({
            ...prev,
            isCompacting: false,
            compactionSummary: event.aborted
              ? "Compaction aborted"
              : resultText.slice(0, 180),
          }));
          break;
        }

        case "extension_ui_request": {
          const req = event as unknown as ExtensionUIRequest & { type: string };
          switch (req.method) {
            case "select":
            case "confirm":
            case "input":
            case "editor": {
              setState((prev) => {
                if (prev.activeDialog) {
                  portRef.current?.postMessage({
                    type: "extension_ui_response",
                    id: prev.activeDialog.request.id,
                    cancelled: true,
                  } satisfies RpcCommand);
                }
                return { ...prev, activeDialog: { request: req } };
              });
              break;
            }
            case "notify": {
              const notification: NotificationItem = {
                id: req.id,
                message: req.message ?? req.title ?? "",
                type: req.notifyType ?? "info",
                timestamp: Date.now(),
              };
              setState((prev) => ({
                ...prev,
                notifications: [...prev.notifications, notification],
              }));
              break;
            }
            case "setStatus": {
              setState((prev) => {
                const key = req.statusKey;
                if (!key) return prev;
                if (!req.statusText) {
                  return {
                    ...prev,
                    statusEntries: prev.statusEntries.filter(
                      (e) => e.key !== key,
                    ),
                  };
                }
                const exists = prev.statusEntries.find((e) => e.key === key);
                const entries = exists
                  ? prev.statusEntries.map((e) =>
                      e.key === key
                        ? { ...e, text: req.statusText as string }
                        : e,
                    )
                  : [
                      ...prev.statusEntries,
                      { key, text: req.statusText as string },
                    ];
                return { ...prev, statusEntries: entries };
              });
              break;
            }
            case "setWidget": {
              setState((prev) => {
                const key = req.widgetKey;
                if (!key) return prev;
                if (!req.widgetLines || req.widgetLines.length === 0) {
                  return {
                    ...prev,
                    widgets: prev.widgets.filter((w) => w.key !== key),
                  };
                }
                const entry: WidgetEntry = {
                  key,
                  lines: req.widgetLines,
                  placement: req.widgetPlacement ?? "aboveEditor",
                };
                const exists = prev.widgets.find((w) => w.key === key);
                const widgets = exists
                  ? prev.widgets.map((w) => (w.key === key ? entry : w))
                  : [...prev.widgets, entry];
                return { ...prev, widgets };
              });
              break;
            }
            case "setTitle": {
              document.title = req.title || "Pi Chrome";
              break;
            }
            case "set_editor_text": {
              setState((prev) => ({
                ...prev,
                editorPrefill: req.text ?? null,
              }));
              break;
            }
            default:
              break;
          }
          break;
        }

        case "response":
          handleResponse(event);
          break;

        default:
          break;
      }
    },
    [handleResponse, requestSessionStats, send, updateCurrentAssistant],
  );

  useEffect(() => {
    let reconnectTimer: number | null = null;

    const connect = () => {
      const port = chrome.runtime.connect({ name: SIDEPANEL_PORT_NAME });
      portRef.current = port;

      port.onMessage.addListener(handleEvent);
      port.onDisconnect.addListener(() => {
        if (reconnectTimer !== null) clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 1000);
      });

      port.postMessage({ type: "get_state" } satisfies RpcCommand);
      port.postMessage({ type: "get_messages" } satisfies RpcCommand);
      port.postMessage({ type: "get_available_models" } satisfies RpcCommand);
      port.postMessage({ type: "get_session_stats" } satisfies RpcCommand);
      port.postMessage({ type: "list_sessions" } satisfies RpcCommand);
    };

    connect();

    return () => {
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, [handleEvent]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (!current.isConnected || current.isStreaming) return;
      send({ type: "get_state" });
      requestSessionStats();
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [requestSessionStats, send]);

  const respondToDialog = useCallback(
    (response: {
      value?: string;
      confirmed?: boolean;
      cancelled?: boolean;
    }) => {
      setState((prev) => {
        if (!prev.activeDialog) return prev;
        send({
          type: "extension_ui_response",
          id: prev.activeDialog.request.id,
          ...response,
        });
        return { ...prev, activeDialog: null };
      });
    },
    [send],
  );

  const dismissNotification = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => n.id !== id),
    }));
  }, []);

  const clearEditorPrefill = useCallback(() => {
    setState((prev) => ({ ...prev, editorPrefill: null }));
  }, []);

  const sendPrompt = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      const userMsg: UiMessage = {
        id: newId(),
        role: "user",
        timestamp: Date.now(),
        text: trimmed,
        thinking: "",
        toolCalls: [],
        segments: [],
        isStreaming: false,
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
      }));

      if (!firstUserMessageRef.current) {
        firstUserMessageRef.current = trimmed;
      }

      send({ type: "prompt", message: trimmed });
    },
    [send],
  );

  const api = useMemo(
    () => ({
      ...state,
      sendPrompt,
      abort: () => send({ type: "abort" }),
      getState: () => send({ type: "get_state" }),
      listSessions,
      switchSession: (sessionPath: string) =>
        send({ type: "switch_session", sessionPath }),
      newSession: () => send({ type: "new_session" }),
      refreshModels: () => send({ type: "get_available_models" }),
      setModel: (provider: string, id: string) =>
        send({ type: "set_model", provider, modelId: id }),
      cycleThinkingLevel: () => send({ type: "cycle_thinking_level" }),
      refreshStats: () => requestSessionStats(),
      retryConnection: () => send({ type: "retry_native_connection" }),
      respondToDialog,
      dismissNotification,
      clearEditorPrefill,
    }),
    [
      clearEditorPrefill,
      dismissNotification,
      listSessions,
      requestSessionStats,
      respondToDialog,
      send,
      sendPrompt,
      state,
    ],
  );

  return api;
}
