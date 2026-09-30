import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { describe, expect, it } from "vitest";
import getCurrentTimeExtension from "./index";

describe("get_current_time result contract", () => {
  it("returns the time fields as structured content", async () => {
    const pi = await createPiTestHarness(getCurrentTimeExtension);
    const tool = pi.tool("get_current_time");

    const result = await tool.execute({ format: "unix" });

    expectStructuredOutput(tool.registered, result);
    expect(result.structuredContent).toEqual(result.details);
  });

  it("declares a read-only, non-idempotent, closed-world tool", async () => {
    const pi = await createPiTestHarness(getCurrentTimeExtension);

    expect(pi.tool("get_current_time").registered.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });
});
