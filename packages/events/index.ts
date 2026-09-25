import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Subscribe to an event once. The handler fires at most one time,
 * and the listener is automatically removed before the handler runs.
 */
export function once<T = unknown>(
  pi: ExtensionAPI,
  event: string,
  handler: (data: T) => void,
): void {
  const off = pi.events.on(event, (data: unknown) => {
    off();
    handler(data as T);
  });
}

export const AD_NOTIFY_DANGEROUS_EVENT = "ad:notify:dangerous";
export const AD_NOTIFY_ATTENTION_EVENT = "ad:notify:attention";
export const AD_NOTIFY_DONE_EVENT = "ad:notify:done";

export interface AdNotifyDangerousEvent {
  description: string;
  toolName?: string;
  toolCallId?: string;
}

export interface AdNotifyAttentionEvent {
  description?: string;
  reason?: string;
  toolName?: string;
  toolCallId?: string;
}

export interface AdNotifyDoneEvent {
  summary?: string;
  status?: "ok" | "error";
  loops?: number;
  toolCalls?: number;
}

export const AD_EDITOR_STASH_CHANGED_EVENT = "ad:editor-stash:changed";

export type AdEditorStashChangedEvent = {
  hasContent: boolean;
};

export const AD_HEADER_COLLECT_EVENT = "ad:header:collect";
export const AD_HEADER_REGISTER_COMMAND_EVENT = "ad:header:register-command";
export const AD_HEADER_REGISTER_SHORTCUT_EVENT = "ad:header:register-shortcut";
export const AD_HEADER_REGISTER_COMPLETION_EVENT =
  "ad:header:register-completion";
export const AD_HEADER_REGISTER_LOGO_EVENT = "ad:header:register-logo";

export type AdHeaderRegisterCommandEvent = {
  name: string;
  description: string;
};

export type AdHeaderRegisterShortcutEvent = {
  key: string;
  description: string;
};

export type AdHeaderRegisterCompletionEvent = {
  trigger: string;
  description: string;
};

export const WORKSPACE_METADATA_CUSTOM_TYPE = "workspace-metadata";
export const AD_WORKSPACE_METADATA_CAPTURED_EVENT =
  "ad:workspace-metadata:captured";

export interface WorkspaceRemote {
  name: string;
  host: string;
  repo: string;
}

export interface WorkspaceMetadata {
  hostname: string;
  cwd: string;
  remotes: WorkspaceRemote[];
}

// ─── TPS telemetry (hooks/tps) ─────────────────────────────────────────────

export const AD_TPS_TELEMETRY_EVENT = "ad:tps:telemetry";

export interface TpsCost {
  input: number;
  output: number;
  total: number;
}

export interface TpsTelemetry {
  model: { provider: string; modelId: string };
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  timing: {
    ttftMs: number | null;
    totalMs: number;
    generationMs: number;
    streamMs: number | null;
    stallMs: number;
    stallCount: number;
    messageCount: number;
  };
  tps: number | null;
  isPrimaryBranch: boolean;
  cost: TpsCost | null;
  timestamp: number;
}

// nvim undo

export const NVIM_UNDO_REGISTER_TOOL_EVENT = "neovim:undo:register-tool";
export const NVIM_UNDO_REQUEST_TOOLS_EVENT = "neovim:undo:request-tools";
