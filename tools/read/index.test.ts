import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { describe, expect, it, vi } from "vitest";
import readExtension from "./index";

// Upstream packages are externalized, so the global memfs mock does not reach
// their fs imports. Use the real fs end to end in this file.
vi.unmock("node:fs");
vi.unmock("node:fs/promises");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("read tool result contract", () => {
  it("declares read-only, closed-world annotations", async () => {
    const pi = await createPiTestHarness(readExtension);

    expect(pi.tool("read").registered.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  // Regression: passing partial `operations` upstream replaces defaults
  // wholesale. Without `detectImageMimeType` every file was read as text.
  it("attaches image content for png files", async () => {
    const pi = await createPiTestHarness(readExtension);
    writeFileSync(join(pi.cwd, "pixel.png"), PNG_1X1);

    const result = await pi.tool("read").execute({ path: "pixel.png" });

    const image = result.content.find((block) => block.type === "image");
    expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
  });
});
