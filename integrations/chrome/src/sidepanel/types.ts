import type { BridgeStatusState } from "@/common/constants";

export type ToolStatus = "running" | "done" | "error";

export interface ToolExecution {
  id: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  summary?: string;
  partialOutput?: string;
  result?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export type AssistantSegment =
  | {
      id: string;
      kind: "thinking";
      text: string;
      startedAt: number;
      endedAt?: number;
      durationMs?: number;
      isStreaming: boolean;
    }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
    }
  | {
      id: string;
      kind: "text";
      text: string;
      isStreaming: boolean;
      startedAt: number;
      endedAt?: number;
    };

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  timestamp: number;
  text: string;
  thinking: string;
  thinkingDuration?: number;
  toolCalls: ToolExecution[];
  segments: AssistantSegment[];
  isStreaming: boolean;
  model?: string;
}

export interface ModelInfo {
  provider: string;
  id: string;
}

export interface AvailableModel extends ModelInfo {
  displayName?: string;
  supportsThinking?: boolean;
}

export interface SessionSummary {
  sessionPath: string;
  sessionName?: string;
  updatedAt?: number;
  messageCount?: number;
}

export interface SessionStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextPercent?: number;
  contextWindow?: number;
}

// Extension UI types

export type ExtensionUIMethod =
  | "select"
  | "confirm"
  | "input"
  | "editor"
  | "notify"
  | "setStatus"
  | "setWidget"
  | "setTitle"
  | "set_editor_text";

export interface ExtensionUIRequest {
  id: string;
  method: ExtensionUIMethod;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  notifyType?: "info" | "warning" | "error";
  timeout?: number;
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: "aboveEditor" | "belowEditor";
  text?: string;
}

export interface ActiveDialog {
  request: ExtensionUIRequest;
}

export interface NotificationItem {
  id: string;
  message: string;
  type: "info" | "warning" | "error";
  timestamp: number;
}

export interface StatusEntry {
  key: string;
  text: string;
}

export interface WidgetEntry {
  key: string;
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
}

export interface PiAgentState {
  messages: UiMessage[];
  isStreaming: boolean;
  isConnected: boolean;
  bridgeStatus: BridgeStatusState;
  bridgeError?: string;
  bridgeReconnectAttempt?: number;
  bridgeReconnectMax?: number;
  canRetryBridge: boolean;
  currentModel: ModelInfo | null;
  availableModels: AvailableModel[];
  thinkingLevel?: string;
  sessionName?: string;
  sessionFile?: string;
  messageCount?: number;
  pendingMessageCount?: number;
  sessions: SessionSummary[];
  isLoadingSessions: boolean;
  sessionError?: string;
  sessionStats: SessionStats | null;
  isLoadingStats: boolean;
  statsError?: string;
  isCompacting: boolean;
  compactionSummary?: string;
  activeDialog: ActiveDialog | null;
  notifications: NotificationItem[];
  statusEntries: StatusEntry[];
  widgets: WidgetEntry[];
  editorPrefill: string | null;
}
