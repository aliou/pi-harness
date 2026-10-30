import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { formatProgramStatus } from "@earendil-works/pi-tui";
import { AD_NOTIFY_ATTENTION_EVENT } from "@harness/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import programStatus from "./index";

type Handler = (event: unknown, ctx: unknown) => unknown;

interface MockPi {
  api: ExtensionAPI;
  fire(event: string, payload?: unknown, ctx?: unknown): void;
  emit(channel: string, data: unknown): void;
}

function createMockPi(sessionName = "rex-work"): MockPi {
  const events = createEventBus();
  const handlers = new Map<string, Handler[]>();
  const api = {
    events,
    getSessionName: () => sessionName,
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  return {
    api,
    fire(event, payload = {}, ctx = {}) {
      for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
    },
    emit: (channel, data) => events.emit(channel, data),
  };
}

function tuiContext(idle = false) {
  return { mode: "tui", isIdle: () => idle };
}

function decodedStates(write: ReturnType<typeof vi.fn>): string[] {
  return write.mock.calls.map(([sequence]) => {
    const match = /state=(\w+)/.exec(String(sequence));
    return match?.[1] ?? "";
  });
}

describe("program status hook", () => {
  const originalEnv = process.env;
  const originalTTY = process.stdout.isTTY;
  const originalWrite = process.stdout.write;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      writable: true,
    });
    write = vi.fn();
    process.stdout.write = write as unknown as typeof process.stdout.write;
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalTTY,
      writable: true,
    });
    process.stdout.write = originalWrite;
  });

  function startedPi(): MockPi {
    const pi = createMockPi();
    programStatus(pi.api);
    pi.fire("session_start", {}, tuiContext());
    return pi;
  }

  function askUser(pi: MockPi, toolCallId: string, description?: string) {
    pi.emit(AD_NOTIFY_ATTENTION_EVENT, {
      toolName: "ask_user",
      toolCallId,
      description,
    });
  }

  it("blocks for ask_user and restores working when its tool call ends", () => {
    const pi = startedPi();

    askUser(pi, "tc_1", "Ask user question");
    pi.fire("tool_execution_end", { toolCallId: "tc_other" });
    pi.fire("tool_execution_end", { toolCallId: "tc_1" });

    expect(decodedStates(write)).toEqual(["blocked", "working"]);
    expect(write.mock.calls[0]?.[0]).toContain("kind=question");
    expect(write.mock.calls[1]?.[0]).toContain(
      `msg=${Buffer.from("rex-work").toString("base64")}`,
    );
  });

  it("restores idle when the block clears outside a run", () => {
    const pi = createMockPi();
    programStatus(pi.api);
    pi.fire("session_start", {}, tuiContext(true));

    askUser(pi, "tc_1");
    pi.fire("tool_execution_end", { toolCallId: "tc_1" });

    expect(decodedStates(write)).toEqual(["blocked", "idle"]);
  });

  it("ignores attention events that are not ask_user", () => {
    const pi = startedPi();

    pi.emit(AD_NOTIFY_ATTENTION_EVENT, { description: "Path access" });
    pi.emit(AD_NOTIFY_ATTENTION_EVENT, { toolName: "bash", toolCallId: "t" });

    expect(write).not.toHaveBeenCalled();
  });

  it("keeps the remaining block when one of two clears", () => {
    const pi = startedPi();

    askUser(pi, "tc_1", "first");
    askUser(pi, "tc_2", "second");
    pi.fire("tool_execution_end", { toolCallId: "tc_2" });

    expect(decodedStates(write)).toEqual(["blocked", "blocked", "blocked"]);
    expect(write.mock.calls[2]?.[0]).toContain(
      `msg=${Buffer.from("first").toString("base64")}`,
    );
  });

  it("drops blocks on agent_settled without writing", () => {
    const pi = startedPi();

    askUser(pi, "tc_1");
    pi.fire("agent_settled");
    pi.fire("tool_execution_end", { toolCallId: "tc_1" });

    expect(decodedStates(write)).toEqual(["blocked"]);
  });

  it("writes nothing outside the TUI", () => {
    const pi = createMockPi();
    programStatus(pi.api);
    pi.fire("session_start", {}, { mode: "rpc", isIdle: () => true });

    askUser(pi, "tc_1");

    expect(write).not.toHaveBeenCalled();
  });

  it("writes nothing when PI_PROGRAM_STATUS=0", () => {
    process.env = { ...originalEnv, PI_PROGRAM_STATUS: "0" };
    const pi = startedPi();

    askUser(pi, "tc_1");

    expect(write).not.toHaveBeenCalled();
  });

  it("writes nothing when stdout is not a terminal", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      writable: true,
    });
    const pi = startedPi();

    askUser(pi, "tc_1");

    expect(write).not.toHaveBeenCalled();
  });

  it("writes the report Pi's own formatter produces", () => {
    const pi = startedPi();

    askUser(pi, "tc_1", "Pick one");

    expect(write).toHaveBeenCalledWith(
      formatProgramStatus({
        state: "blocked",
        kind: "question",
        app: "pi",
        message: "Pick one",
      }),
    );
  });

  it("stops listening on session_shutdown", () => {
    const pi = startedPi();

    pi.fire("session_shutdown");
    askUser(pi, "tc_1");

    expect(write).not.toHaveBeenCalled();
  });
});
