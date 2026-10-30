import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  AD_NOTIFY_DONE_EVENT,
} from "@harness/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import notifications from "./index";

describe("notifications extension entry", () => {
  const originalPlatform = process.platform;
  const originalTTY = process.stdout.isTTY;
  const originalEnv = process.env;
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalTTY,
      writable: true,
    });
    process.env = { ...originalEnv };
    process.stdout.write = originalWrite;
  });

  function createMockPi(): ExtensionAPI {
    const events = createEventBus();
    const handlers = new Map<string, (data: unknown) => void | Promise<void>>();
    return {
      events,
      exec: vi.fn(),
      on: vi.fn(
        (event: string, handler: (data: unknown) => void | Promise<void>) => {
          handlers.set(event, handler);
          return undefined;
        },
      ),
      __invoke: (event: string, data: unknown) => {
        const handler = handlers.get(event);
        if (handler) {
          void handler(data);
        }
      },
    } as unknown as ExtensionAPI;
  }

  it("consumer registration does not duplicate events or sounds", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    notifications(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, { status: "ok" });

    expect(pi.exec).toHaveBeenCalledTimes(1);
  });

  it("emits ask_user attention with toolName and toolCallId through the extension", () => {
    let emitted: unknown;
    const pi = createMockPi();
    pi.events.on(AD_NOTIFY_ATTENTION_EVENT, (data) => {
      emitted = data;
    });

    notifications(pi);
    (
      pi as unknown as { __invoke: (event: string, data: unknown) => void }
    ).__invoke("tool_call", {
      toolName: "ask_user",
      toolCallId: "tc_42",
      input: {},
    });

    expect(emitted).toMatchObject({
      description: "Ask user question",
      toolName: "ask_user",
      toolCallId: "tc_42",
      source: "notifications:producer",
    });
  });
});
