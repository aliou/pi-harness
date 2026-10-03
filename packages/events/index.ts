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

// nvim undo

export const NVIM_UNDO_REGISTER_TOOL_EVENT = "neovim:undo:register-tool";
export const NVIM_UNDO_REQUEST_TOOLS_EVENT = "neovim:undo:request-tools";

// pi-rig fast mode (`/fast`, code.378labs.dev/aliou/pi-rig `@rig/types`).
// The status lives in memory in the rig extension and is broadcast over
// `pi.events`; it is not written to the session. Vendored here so harness
// extensions can reflect the toggle without a dependency on the rig repo.

export const FAST_STATUS_CHANGED_EVENT = "rig:fast:status-changed";
export const FAST_STATUS_REQUEST_EVENT = "rig:fast:status-request";

export interface FastStatus {
  enabled: boolean;
  provider?: string;
}

export interface FastStatusRequest {
  reply: (status: FastStatus) => void;
}

export function isFastStatus(value: unknown): value is FastStatus {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as FastStatus).enabled === "boolean";
}
