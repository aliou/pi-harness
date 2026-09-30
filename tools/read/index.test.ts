import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { describe, expect, it } from "vitest";
import readExtension from "./index";

describe("read tool result contract", () => {
  it("declares read-only, closed-world annotations", async () => {
    const pi = await createPiTestHarness(readExtension);

    expect(pi.tool("read").registered.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
