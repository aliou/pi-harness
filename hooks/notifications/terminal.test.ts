import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  AD_NOTIFY_DANGEROUS_EVENT,
  AD_NOTIFY_DONE_EVENT,
} from "@harness/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOscSequences,
  renderTerminalMessage,
  setupTerminalConsumer,
  shouldUseTerminalEffects,
} from "./terminal";

describe("buildOscSequences", () => {
  it("returns OSC 9 and OSC 777 sequences", () => {
    const [osc9, osc777] = buildOscSequences("Pi", "hello");
    expect(osc9).toBe("\x1b]9;Pi: hello\x1b\\");
    expect(osc777).toBe("\x1b]777;notify;Pi;hello\x1b\\");
  });
});

describe("shouldUseTerminalEffects", () => {
  it("returns false inside Herdr", () => {
    expect(shouldUseTerminalEffects({ HERDR_ENV: "1" }, true)).toBe(false);
  });

  it("returns false inside Rex", () => {
    expect(shouldUseTerminalEffects({ REX_SESSION: "session:1" }, true)).toBe(
      false,
    );
  });

  it("returns false when stdout is not a TTY", () => {
    expect(shouldUseTerminalEffects({}, false)).toBe(false);
  });

  it("returns true outside Herdr with a TTY", () => {
    expect(shouldUseTerminalEffects({}, true)).toBe(true);
  });
});

describe("renderTerminalMessage", () => {
  it("formats dangerous messages", () => {
    expect(
      renderTerminalMessage(AD_NOTIFY_DANGEROUS_EVENT, {
        description: "rm -rf /",
      }),
    ).toBe("Dangerous command detected: rm -rf /");
  });

  it("prefers attention description", () => {
    expect(
      renderTerminalMessage(AD_NOTIFY_ATTENTION_EVENT, {
        description: "desc",
        reason: "reason",
      }),
    ).toBe("desc");
  });

  it("falls back to reason then default", () => {
    expect(
      renderTerminalMessage(AD_NOTIFY_ATTENTION_EVENT, { reason: "reason" }),
    ).toBe("reason");
    expect(renderTerminalMessage(AD_NOTIFY_ATTENTION_EVENT, {})).toBe(
      "Waiting for user input",
    );
  });

  it("formats done messages", () => {
    expect(
      renderTerminalMessage(AD_NOTIFY_DONE_EVENT, { summary: "completed" }),
    ).toBe("completed");
    expect(renderTerminalMessage(AD_NOTIFY_DONE_EVENT, {})).toBe("done");
  });
});

describe("setupTerminalConsumer", () => {
  const originalTTY = process.stdout.isTTY;
  const originalEnv = process.env;
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalTTY,
      writable: true,
    });
    process.env = { ...originalEnv };
    process.stdout.write = originalWrite;
  });

  function createMockPi(): ExtensionAPI {
    return {
      events: createEventBus(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;
  }

  it("sends OSC outside Herdr when stdout is a TTY", () => {
    process.env.HERDR_ENV = "";
    process.stdout.isTTY = true;
    const write = vi.fn();
    process.stdout.write = write as unknown as typeof process.stdout.write;

    const pi = createMockPi();
    setupTerminalConsumer(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, { status: "ok", summary: "done" });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("\x1b]9;Pi: done\x1b\\"),
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("\x1b]777;notify;Pi;done\x1b\\"),
    );
  });

  it("does not send OSC inside Herdr", () => {
    process.env.HERDR_ENV = "1";
    process.stdout.isTTY = true;
    const write = vi.fn();
    process.stdout.write = write as unknown as typeof process.stdout.write;

    const pi = createMockPi();
    setupTerminalConsumer(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, { status: "ok" });

    expect(write).not.toHaveBeenCalled();
  });

  it("does not send OSC when stdout is not a TTY", () => {
    process.env.HERDR_ENV = "";
    process.stdout.isTTY = false;
    const write = vi.fn();
    process.stdout.write = write as unknown as typeof process.stdout.write;

    const pi = createMockPi();
    setupTerminalConsumer(pi);

    pi.events.emit(AD_NOTIFY_ATTENTION_EVENT, { description: "hi" });

    expect(write).not.toHaveBeenCalled();
  });
});
