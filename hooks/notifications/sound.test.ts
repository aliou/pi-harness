import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  AD_NOTIFY_ATTENTION_EVENT,
  AD_NOTIFY_DANGEROUS_EVENT,
  AD_NOTIFY_DONE_EVENT,
} from "@harness/events";
import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAY_ALERT_SOUND_BINARY,
  playSound,
  selectSoundPath,
  setupSoundConsumer,
} from "./sound";

describe("selectSoundPath", () => {
  it("maps attention to Glass", () => {
    expect(selectSoundPath(AD_NOTIFY_ATTENTION_EVENT)).toBe(
      "/System/Library/Sounds/Glass.aiff",
    );
  });

  it("maps dangerous to Glass", () => {
    expect(selectSoundPath(AD_NOTIFY_DANGEROUS_EVENT)).toBe(
      "/System/Library/Sounds/Glass.aiff",
    );
  });

  it("maps successful done to Funk", () => {
    expect(selectSoundPath(AD_NOTIFY_DONE_EVENT, { status: "ok" })).toBe(
      "/System/Library/Sounds/Funk.aiff",
    );
  });

  it("maps error done to Basso", () => {
    expect(selectSoundPath(AD_NOTIFY_DONE_EVENT, { status: "error" })).toBe(
      "/System/Library/Sounds/Basso.aiff",
    );
  });
});

describe("playSound", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
    });
  });

  it("is a no-op on non-macOS platforms", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const exec = vi.fn();
    await playSound(exec, "/System/Library/Sounds/Glass.aiff");
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("setupSoundConsumer", () => {
  const originalPlatform = process.platform;
  const originalTTY = process.stdout.isTTY;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    vol.fromJSON({ [PLAY_ALERT_SOUND_BINARY]: "" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalTTY,
      writable: true,
    });
    process.env = { ...originalEnv };
  });

  function createMockPi(): ExtensionAPI {
    return {
      events: createEventBus(),
      exec: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;
  }

  it("plays Glass once per attention event", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_ATTENTION_EVENT, {
      description: "Waiting for user input",
      toolCallId: "tc_1",
    });

    expect(pi.exec).toHaveBeenCalledTimes(1);
    expect(pi.exec).toHaveBeenCalledWith(
      expect.stringContaining("play-alert-sound"),
      ["/System/Library/Sounds/Glass.aiff"],
    );
  });

  it("plays Glass once per dangerous event", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_DANGEROUS_EVENT, {
      description: "rm -rf /",
      toolCallId: "tc_2",
    });

    expect(pi.exec).toHaveBeenCalledTimes(1);
    expect(pi.exec).toHaveBeenCalledWith(
      expect.stringContaining("play-alert-sound"),
      ["/System/Library/Sounds/Glass.aiff"],
    );
  });

  it("plays Funk once for successful done", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, { status: "ok", summary: "done" });

    expect(pi.exec).toHaveBeenCalledTimes(1);
    expect(pi.exec).toHaveBeenCalledWith(
      expect.stringContaining("play-alert-sound"),
      ["/System/Library/Sounds/Funk.aiff"],
    );
  });

  it("plays Basso once for error done", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, {
      status: "error",
      summary: "failed",
    });

    expect(pi.exec).toHaveBeenCalledTimes(1);
    expect(pi.exec).toHaveBeenCalledWith(
      expect.stringContaining("play-alert-sound"),
      ["/System/Library/Sounds/Basso.aiff"],
    );
  });

  it("does not play inside Herdr", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "1";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, { status: "ok" });

    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("does not depend on stdout.isTTY", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = true;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_ATTENTION_EVENT, { description: "hi" });

    expect(pi.exec).toHaveBeenCalledTimes(1);
  });

  it("does not result in duplicate playback for a single event", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.stdout.isTTY = false;
    process.env.HERDR_ENV = "";

    const pi = createMockPi();
    setupSoundConsumer(pi);

    pi.events.emit(AD_NOTIFY_DONE_EVENT, { status: "ok" });

    expect(pi.exec).toHaveBeenCalledTimes(1);
  });
});
