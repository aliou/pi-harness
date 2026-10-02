import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  AD_WORKSPACE_METADATA_CAPTURED_EVENT,
  WORKSPACE_METADATA_CUSTOM_TYPE,
  type WorkspaceMetadata,
} from "@harness/events";
import { createCustomHeader } from "../components/header";

export function findLatestWorkspaceMetadata(
  entries: readonly SessionEntry[],
): WorkspaceMetadata | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      entry?.type === "custom" &&
      entry.customType === WORKSPACE_METADATA_CUSTOM_TYPE
    ) {
      return entry.data as WorkspaceMetadata;
    }
  }
  return undefined;
}

export function setupHeaderHook(pi: ExtensionAPI) {
  const header = createCustomHeader();
  let offWorkspaceMetadata: (() => void) | undefined;

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    offWorkspaceMetadata?.();

    header.setup(ctx, {
      workspaceMetadata: findLatestWorkspaceMetadata(
        ctx.sessionManager.getEntries(),
      ),
    });

    offWorkspaceMetadata = pi.events.on(
      AD_WORKSPACE_METADATA_CAPTURED_EVENT,
      (data) => {
        header.setWorkspaceMetadata(data as WorkspaceMetadata);
      },
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    offWorkspaceMetadata?.();
    offWorkspaceMetadata = undefined;
    header.cleanup(ctx);
  });
}
