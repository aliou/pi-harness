import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREVIEW_MAX_BYTES,
  DEFAULT_PREVIEW_MAX_LINES,
  writeTempFilePreview,
} from "./temp-file-preview";

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

beforeEach(() => {
  vol.fromJSON({ "/tmp/.keep": "" });
});

describe("writeTempFilePreview", () => {
  it("returns full content as preview when under both limits", async () => {
    const { preview, tempFilePath, totalLines } = await writeTempFilePreview(
      "line1\nline2\nline3",
      { slug: "test" },
    );

    expect(preview).toBe("line1\nline2\nline3");
    expect(totalLines).toBe(3);
    expect(vol.readFileSync(tempFilePath, "utf-8")).toBe("line1\nline2\nline3");
  });

  it("truncates by lines when maxLines is exceeded", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const content = lines.join("\n");
    const { preview, tempFilePath, totalLines } = await writeTempFilePreview(
      content,
      { slug: "test", maxLines: 5 },
    );

    expect(preview).toContain("Line 5");
    expect(preview).not.toContain("Line 6");
    expect(preview).toContain("truncated");
    expect(totalLines).toBe(20);

    expect(vol.readFileSync(tempFilePath, "utf-8")).toBe(content);
  });

  it("truncates by bytes when maxBytes is exceeded before line limit", async () => {
    // 5 lines of 1000 chars each = ~5KB
    const lines = Array.from(
      { length: 5 },
      (_, i) => `${"x".repeat(1000)} line ${i + 1}`,
    );
    const content = lines.join("\n");
    const { preview, tempFilePath, totalLines } = await writeTempFilePreview(
      content,
      { slug: "test", maxBytes: 2048 },
    );

    expect(preview).toContain("line 1");
    expect(preview).toContain("line 2");
    expect(preview).not.toContain("line 3");
    expect(preview).toContain("truncated");
    expect(totalLines).toBe(5);

    expect(vol.readFileSync(tempFilePath, "utf-8")).toBe(content);
  });

  it("handles single-line content that exceeds maxBytes", async () => {
    const content = "x".repeat(10000);
    const { preview } = await writeTempFilePreview(content, {
      slug: "test",
      maxBytes: 2048,
    });

    // First line exceeds maxBytes, preview is empty (no partial lines)
    expect(preview).toContain("truncated");
  });

  it("uses default limits matching native read tool", () => {
    expect(DEFAULT_PREVIEW_MAX_LINES).toBe(2000);
    expect(DEFAULT_PREVIEW_MAX_BYTES).toBe(50 * 1024);
  });
});
