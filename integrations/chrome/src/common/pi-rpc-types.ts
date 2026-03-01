export interface ImageContent {
  type: "image";
  data: string;
  mediaType?: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: unknown;
}

export interface ToolResult {
  content?: unknown;
  error?: string;
}

export interface ToolResultMessage {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  isError?: boolean;
}

export interface AssistantMessageEvent {
  type:
    | "start"
    | "text_start"
    | "text_delta"
    | "text_end"
    | "thinking_start"
    | "thinking_delta"
    | "thinking_end"
    | "toolcall_start"
    | "toolcall_delta"
    | "toolcall_end"
    | "done"
    | "error";
  contentIndex?: number;
  delta?: string;
  [key: string]: unknown;
}

export type RpcCommand =
  | {
      type: "prompt";
      message: string;
      id?: string;
      images?: ImageContent[];
      streamingBehavior?: "steer" | "followUp";
    }
  | { type: "abort"; id?: string }
  | { type: "get_state"; id?: string }
  | { type: "get_messages"; id?: string }
  | { type: "get_available_models"; id?: string }
  | { type: "set_model"; provider: string; modelId: string; id?: string }
  | { type: "cycle_thinking_level"; id?: string }
  | { type: "get_commands"; id?: string }
  | { type: "get_session_stats"; id?: string }
  | { type: "new_session"; id?: string }
  | { type: "switch_session"; sessionPath: string; id?: string }
  | { type: "set_session_name"; name: string; id?: string }
  | { type: "list_sessions"; id?: string }
  | { type: "retry_native_connection"; id?: string }
  | {
      type: "extension_ui_response";
      id: string;
      value?: string;
      confirmed?: boolean;
      cancelled?: boolean;
    };

export type RpcResponse = {
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
  id?: string;
};

export type RpcEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: AgentMessage;
      toolResults: ToolResultMessage[];
    }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      partialResult: ToolResult;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: ToolResult;
      isError: boolean;
    }
  | { type: "auto_compaction_start"; reason: string }
  | {
      type: "auto_compaction_end";
      result: unknown;
      aborted: boolean;
      willRetry: boolean;
    }
  | {
      type: "auto_retry_start";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      errorMessage: string;
    }
  | {
      type: "auto_retry_end";
      success: boolean;
      attempt: number;
      finalError?: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: string;
      [key: string]: unknown;
    }
  | {
      type: "extension_error";
      extensionPath: string;
      event: string;
      error: string;
    }
  | RpcResponse;
