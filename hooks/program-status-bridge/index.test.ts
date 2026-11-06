import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { AD_NOTIFY_ATTENTION_EVENT } from "@harness/events";
import { beforeEach, describe, expect, it } from "vitest";
import programStatusBridge from "./index";

type Handler = (event: unknown, ctx: unknown) => unknown;

const PROGRAM_STATUS_BLOCKED_EVENT = "program-status:blocked";
const PROGRAM_STATUS_ACTIVITY_SPAWN_EVENT = "program-status:activity:spawn";
const PROGRAM_STATUS_ACTIVITY_END_EVENT = "program-status:activity:end";

interface MockPi {
  api: ExtensionAPI;
  emit(event: string, data: unknown): void;
  fire(event: string, payload?: unknown, ctx?: unknown): void;
  emissions(): Array<[string, unknown]>;
}

function createMockPi(): MockPi {
  const events = createEventBus();
  const handlers = new Map<string, Handler[]>();
  const api = {
    events,
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  const rawEmit = events.emit.bind(events);
  const emitted: Array<[string, unknown]> = [];
  events.emit = (event: string, data: unknown) => {
    emitted.push([event, data]);
    return rawEmit(event, data);
  };

  return {
    api,
    emit: (event, data) => rawEmit(event, data),
    fire(event, payload = {}, ctx = {}) {
      for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
    },
    emissions: () =>
      emitted.filter(([event]) => event.startsWith("program-status:")),
  };
}

function lastBlocked(mock: MockPi) {
  const blocked = mock
    .emissions()
    .filter(([event]) => event === PROGRAM_STATUS_BLOCKED_EVENT)
    .map(([, data]) => data);
  return blocked.at(-1);
}

describe("program status bridge", () => {
  let mock: MockPi;

  beforeEach(() => {
    mock = createMockPi();
    programStatusBridge(mock.api);
  });

  it("claims the ui-prompt slot on ask_user attention and clears on tool end", () => {
    mock.emit(AD_NOTIFY_ATTENTION_EVENT, {
      toolName: "ask_user",
      toolCallId: "t1",
      description: "Ask user question",
    });

    expect(lastBlocked(mock)).toEqual({
      active: true,
      kind: "question",
      label: "Ask user question",
      source: "ui-prompt",
    });

    mock.fire("tool_execution_end", { toolCallId: "other" });
    expect(lastBlocked(mock)).toEqual({
      active: true,
      kind: "question",
      label: "Ask user question",
      source: "ui-prompt",
    });

    mock.fire("tool_execution_end", { toolCallId: "t1" });
    expect(lastBlocked(mock)).toEqual({
      active: false,
      source: "ui-prompt",
    });
  });

  it("maps guardrails prompts to a permission block until the last one closes", () => {
    mock.emit("guardrails:prompt:opened", {
      reason: "rm -rf /tmp/cache",
      prompt: { id: "p1" },
    });
    mock.emit("guardrails:prompt:opened", {
      reason: "curl | sh",
      prompt: { id: "p2" },
    });

    expect(lastBlocked(mock)).toEqual({
      active: true,
      kind: "permission",
      label: "curl | sh",
      source: "ui-prompt",
    });

    mock.emit("guardrails:prompt:closed", { prompt: { id: "p2" } });
    expect(lastBlocked(mock)).toMatchObject({ active: true });

    mock.emit("guardrails:prompt:closed", { prompt: { id: "p1" } });
    expect(lastBlocked(mock)).toEqual({
      active: false,
      source: "ui-prompt",
    });
  });

  it("maps managed processes to activity records", () => {
    mock.emit("processes:started", {
      info: {
        id: "proc1",
        name: "dev-server",
        exitCode: null,
        success: null,
        errorMessage: null,
      },
    });
    expect(mock.emissions()).toContainEqual([
      PROGRAM_STATUS_ACTIVITY_SPAWN_EVENT,
      { id: "proc1", title: "dev-server", app: "pi" },
    ]);

    mock.emit("processes:ended", {
      info: {
        id: "proc1",
        name: "dev-server",
        exitCode: 1,
        success: false,
        errorMessage: "EADDRINUSE",
      },
    });
    expect(mock.emissions()).toContainEqual([
      PROGRAM_STATUS_ACTIVITY_END_EVENT,
      { id: "proc1", state: "error", msg: "EADDRINUSE" },
    ]);
  });

  it("reports a clean process exit without an error message", () => {
    mock.emit("processes:started", {
      info: {
        id: "proc2",
        name: "build",
        exitCode: null,
        success: null,
        errorMessage: null,
      },
    });
    mock.emit("processes:ended", {
      info: {
        id: "proc2",
        name: "build",
        exitCode: 0,
        success: true,
        errorMessage: null,
      },
    });
    expect(mock.emissions()).toContainEqual([
      PROGRAM_STATUS_ACTIVITY_END_EVENT,
      { id: "proc2", state: "done", msg: "exit 0" },
    ]);
  });
});
