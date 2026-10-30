import { describe, expect, it, vi } from "vitest";
import { createProducer } from "./producer";

describe("notification producer", () => {
  describe("onToolCall", () => {
    it("emits attention event with toolName and toolCallId for ask_user start", () => {
      const notifyDone = vi.fn();
      const notifyAttention = vi.fn();
      const producer = createProducer({ notifyDone, notifyAttention });

      producer.onToolCall(
        {
          toolName: "ask_user",
          toolCallId: "tc_ask_1",
          input: {},
        } as unknown as Parameters<typeof producer.onToolCall>[0],
        {} as unknown as Parameters<typeof producer.onToolCall>[1],
      );

      expect(notifyDone).not.toHaveBeenCalled();
      expect(notifyAttention).toHaveBeenCalledTimes(1);
      expect(notifyAttention).toHaveBeenCalledWith({
        source: "notifications:producer",
        description: "Ask user question",
        toolName: "ask_user",
        toolCallId: "tc_ask_1",
      });
    });
  });

  describe("onAgentEnd", () => {
    function makeAgentEnd(
      stopReason: string,
    ): Parameters<ReturnType<typeof createProducer>["onAgentEnd"]>[0] {
      return {
        messages: [
          {
            role: "assistant",
            stopReason,
          },
        ],
      } as unknown as Parameters<
        ReturnType<typeof createProducer>["onAgentEnd"]
      >[0];
    }

    it("emits one successful done event for a completed run", () => {
      const notifyDone = vi.fn();
      const notifyAttention = vi.fn();
      const producer = createProducer({ notifyDone, notifyAttention });

      producer.onTurnEnd({ toolResults: [], ctx: {} as never });
      const doneEvent = producer.onAgentEnd(makeAgentEnd("stop"));

      expect(doneEvent).toMatchObject({
        status: "ok",
        summary: "done - 1 loops, 0 tools",
        loops: 1,
        toolCalls: 0,
      });
      expect(notifyDone).toHaveBeenCalledTimes(1);
      expect(notifyDone).toHaveBeenCalledWith(doneEvent);
    });

    it("emits one error done event when the assistant ends with error", () => {
      const notifyDone = vi.fn();
      const notifyAttention = vi.fn();
      const producer = createProducer({ notifyDone, notifyAttention });

      producer.onTurnEnd({ toolResults: [], ctx: {} as never });
      const doneEvent = producer.onAgentEnd(makeAgentEnd("error"));

      expect(doneEvent).toMatchObject({
        status: "error",
        summary: "with errors - 1 loops, 0 tools",
        loops: 1,
        toolCalls: 0,
      });
      expect(notifyDone).toHaveBeenCalledTimes(1);
      expect(notifyDone).toHaveBeenCalledWith(doneEvent);
    });

    it("emits no done event for aborted runs", () => {
      const notifyDone = vi.fn();
      const notifyAttention = vi.fn();
      const producer = createProducer({ notifyDone, notifyAttention });

      producer.onTurnEnd({ toolResults: [], ctx: {} as never });
      const doneEvent = producer.onAgentEnd(makeAgentEnd("aborted"));

      expect(doneEvent).toBeUndefined();
      expect(notifyDone).not.toHaveBeenCalled();
    });

    it("resets counters after emitting done", () => {
      const notifyDone = vi.fn();
      const notifyAttention = vi.fn();
      const producer = createProducer({ notifyDone, notifyAttention });

      producer.onTurnEnd({ toolResults: [], ctx: {} as never });
      producer.onAgentEnd(makeAgentEnd("stop"));
      const subsequentDone = producer.onAgentEnd(makeAgentEnd("stop"));

      expect(subsequentDone).toBeUndefined();
      expect(notifyDone).toHaveBeenCalledTimes(1);
    });
  });
});
