import { hostname } from "node:os";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { AD_WORKSPACE_METADATA_CAPTURED_EVENT } from "@harness/events";
import { createCommandContext } from "@harness/test-utils/pi-context";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import workspaceMetadata from "./index";
import { WORKSPACE_METADATA_CUSTOM_TYPE } from "./types";

beforeEach(() => {
  vol.fromJSON({ "/workspace/.keep": "" });
});

function createFixture() {
  let handler:
    | ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void>)
    | undefined;
  const pi = {
    on: vi.fn((event, registeredHandler) => {
      if (event === "session_start") {
        handler = registeredHandler as typeof handler;
      }
    }),
    exec: vi.fn().mockResolvedValue({
      stdout: "origin\tgit@github.com:aliou/pi-harness.git (fetch)\n",
      stderr: "",
      code: 0,
      killed: false,
    }),
    appendEntry: vi.fn(),
    events: { emit: vi.fn() },
  } as unknown as ExtensionAPI;

  workspaceMetadata(pi);
  if (!handler) throw new Error("session_start handler was not registered");
  return { pi, handler };
}

function createContext(
  cwd: string,
  entries: readonly SessionEntry[] = [],
): ExtensionContext {
  return createCommandContext({ cwd, entries: [...entries] });
}

describe("workspace-metadata", () => {
  it("appends canonical workspace metadata", async () => {
    vol.symlinkSync("/workspace", "/linked-workspace");

    const { pi, handler } = createFixture();
    await handler(
      { type: "session_start", reason: "startup" },
      createContext("/linked-workspace"),
    );

    expect(pi.exec).toHaveBeenCalledWith("git", ["remote", "-v"], {
      cwd: "/workspace",
      timeout: 2_000,
    });
    expect(pi.appendEntry).toHaveBeenCalledWith(
      WORKSPACE_METADATA_CUSTOM_TYPE,
      {
        hostname: hostname(),
        cwd: "/workspace",
        remotes: [
          { name: "origin", host: "github.com", repo: "aliou/pi-harness" },
        ],
      },
    );
    expect(pi.events.emit).toHaveBeenCalledWith(
      AD_WORKSPACE_METADATA_CAPTURED_EVENT,
      {
        hostname: hostname(),
        cwd: "/workspace",
        remotes: [
          { name: "origin", host: "github.com", repo: "aliou/pi-harness" },
        ],
      },
    );
  });

  it("records no remotes when git fails", async () => {
    const { pi, handler } = createFixture();
    vi.mocked(pi.exec).mockRejectedValueOnce(new Error("git unavailable"));

    await handler(
      { type: "session_start", reason: "new" },
      createContext("/workspace"),
    );

    expect(pi.appendEntry).toHaveBeenCalledWith(
      WORKSPACE_METADATA_CUSTOM_TYPE,
      expect.objectContaining({ remotes: [] }),
    );
  });

  it("backfills metadata on resume", async () => {
    const { pi, handler } = createFixture();

    await handler(
      { type: "session_start", reason: "resume" },
      createContext("/workspace"),
    );

    expect(pi.exec).toHaveBeenCalledOnce();
    expect(pi.appendEntry).toHaveBeenCalledOnce();
  });

  it("appends fresh metadata when a fork inherited old metadata", async () => {
    const inheritedEntry: SessionEntry = {
      type: "custom",
      id: "old-metadata",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      customType: WORKSPACE_METADATA_CUSTOM_TYPE,
      data: {},
    };
    const { pi, handler } = createFixture();

    await handler(
      { type: "session_start", reason: "fork" },
      createContext("/workspace", [inheritedEntry]),
    );

    expect(pi.appendEntry).toHaveBeenCalledOnce();
  });

  it("does nothing when metadata exists on another session branch", async () => {
    const assistantEntry = {
      type: "message",
      id: "assistant-entry",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "assistant" },
    } as SessionEntry;
    const metadataEntry: SessionEntry = {
      type: "custom",
      id: "existing-metadata",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      customType: WORKSPACE_METADATA_CUSTOM_TYPE,
      data: {},
    };
    const { pi, handler } = createFixture();

    await handler(
      { type: "session_start", reason: "startup" },
      createContext("/workspace", [assistantEntry, metadataEntry]),
    );

    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
  });

  it("does nothing when cwd cannot be resolved", async () => {
    const { pi, handler } = createFixture();

    await handler(
      { type: "session_start", reason: "new" },
      createContext("/path/that/does/not/exist"),
    );

    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
  });
});
