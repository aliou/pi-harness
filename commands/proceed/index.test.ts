import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import setupProceedCommand, { PROCEED_DESCRIPTION } from "./index";

function createMockPi() {
  return {
    on: vi.fn(),
    registerCommand: vi.fn(),
    sendMessage: vi.fn(),
  } as unknown as ExtensionAPI & {
    on: ReturnType<typeof vi.fn>;
    registerCommand: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
  };
}

function getContextHandler(pi: ReturnType<typeof createMockPi>) {
  const call = pi.on.mock.calls.find(([event]) => event === "context");
  if (!call) throw new Error("context handler not registered");
  return call[1] as (event: {
    messages: unknown[];
  }) => { messages?: unknown[] } | undefined;
}

function getCommandHandler(pi: ReturnType<typeof createMockPi>) {
  const call = pi.registerCommand.mock.calls[0];
  if (!call) throw new Error("command not registered");
  return call[1].handler as () => Promise<void>;
}

describe("/proceed command", () => {
  let pi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    pi = createMockPi();
    setupProceedCommand(pi);
  });

  it("registers the /proceed command", () => {
    expect(pi.registerCommand).toHaveBeenCalledTimes(1);
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "proceed",
      expect.objectContaining({
        description: PROCEED_DESCRIPTION,
      }),
    );
  });

  it("sends a hidden custom message that triggers a follow-up turn", async () => {
    const handler = getCommandHandler(pi);

    await handler();

    expect(pi.sendMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "harness:proceed",
        content: [],
        display: false,
      }),
      expect.objectContaining({
        triggerTurn: true,
        deliverAs: "followUp",
      }),
    );
  });

  it("filters its marker from context messages before provider serialization", () => {
    const handler = getContextHandler(pi);
    const marker = { role: "custom", customType: "harness:proceed" };
    const user = { role: "user", content: "hello" };

    const result = handler({ messages: [user, marker] });

    expect(result).toEqual({ messages: [user] });
  });

  it("returns undefined from context handler when there is no marker", () => {
    const handler = getContextHandler(pi);
    const user = { role: "user", content: "hello" };

    const result = handler({ messages: [user] });

    expect(result).toBeUndefined();
  });
});
