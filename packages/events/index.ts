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
// Session entries are the display contract; status events request a redraw.
// Vendored here so harness extensions do not depend on the rig repo.

export const FAST_ENTRY_TYPE = "rig:fast";
export const FAST_STATUS_CHANGED_EVENT = "rig:fast:status-changed";

export interface FastEntry {
  enabled: boolean;
  provider: string;
  modelId: string;
}

export function isFastEntry(value: unknown): value is FastEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<FastEntry>;
  return (
    typeof entry.enabled === "boolean" &&
    typeof entry.provider === "string" &&
    typeof entry.modelId === "string"
  );
}
