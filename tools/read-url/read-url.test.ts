import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { vol } from "memfs";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { executeReadUrlRequest, guessImageExtension } from "./fetch";
import type { ReadUrlHandler } from "./handlers";
import readUrlExtension from "./index";
import { type ReadUrlOutput, ReadUrlOutputSchema } from "./types";
import { STRUCTURED_TEXT_MAX_BYTES } from "./utils/cap-text";
import { DEFAULT_PREVIEW_MAX_BYTES } from "./utils/temp-file-preview";

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

function createHandler(markdown = "tweet markdown"): ReadUrlHandler {
  return {
    name: "twitter",
    matches: () => true,
    fetchData: async (url) => ({
      sourceUrl: url.toString(),
      markdown,
      statusCode: 200,
      statusText: "OK",
      images: [
        { sourceUrl: "https://img.example.com/1.jpg", label: "first" },
        { sourceUrl: "https://img.example.com/2.png", label: "second" },
      ],
    }),
  };
}

beforeEach(() => {
  vol.fromJSON({ "/tmp/.keep": "" });
});

describe("read_url", () => {
  it("writes full content to temp file and returns truncated preview in content", async () => {
    // Create content that exceeds the default byte limit.
    const linesPerMB = Math.ceil(DEFAULT_PREVIEW_MAX_BYTES / 1000) + 10;
    const lines = Array.from(
      { length: linesPerMB },
      (_, i) => `${"x".repeat(1000)} Line ${i + 1}`,
    );
    const markdown = lines.join("\n");

    const nativeRead = {
      execute: vi.fn().mockResolvedValue({
        content: [],
      }),
    };

    const result = await executeReadUrlRequest(
      "https://x.com/alice/status/1",
      undefined,
      [createHandler(markdown)],
      nativeRead,
    );

    expect(result.details).toBeDefined();
    expect(result.details?.tempFilePath).toBeTruthy();

    // The content should be a truncated preview.
    const textBlock = result.content.find((c) => c.type === "text");
    expect(textBlock?.type).toBe("text");
    expect(textBlock && "text" in textBlock ? textBlock.text : "").toContain(
      "Line 1",
    );
    // Should NOT contain later lines that don't fit in 50KB.
    expect(
      textBlock && "text" in textBlock ? textBlock.text : "",
    ).not.toContain("Line 55");
    // Should contain the truncation hint.
    expect(textBlock && "text" in textBlock ? textBlock.text : "").toContain(
      "truncated",
    );
    expect(result.details?.tempFilePath).toBeTruthy();
    expect(result.details?.totalLines).toBe(linesPerMB);

    // Verify the temp file in memfs contains the full content.
    assert(result.details?.tempFilePath, "tempFilePath should exist");
    const tempFileContent = vol.readFileSync(
      result.details.tempFilePath,
      "utf-8",
    ) as string;
    expect(tempFileContent).toBe(markdown);
  });

  it("returns full content when under preview threshold", async () => {
    const markdown = "short content";

    const nativeRead = {
      execute: vi.fn().mockResolvedValue({
        content: [],
      }),
    };

    const result = await executeReadUrlRequest(
      "https://x.com/alice/status/1",
      undefined,
      [createHandler(markdown)],
      nativeRead,
    );

    expect(result.details).toBeDefined();
    expect(result.details?.tempFilePath).toBeTruthy();

    const textBlock = result.content.find((c) => c.type === "text");
    expect(textBlock?.type).toBe("text");
    expect(textBlock && "text" in textBlock ? textBlock.text : "").toBe(
      "short content",
    );
    expect(result.details?.totalLines).toBe(1);
  });

  it("appends native read image content after preview", async () => {
    const nativeRead = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          content: [
            { type: "text", text: "Read image file [1-first.jpg]" },
            { type: "image", image: "img-1" },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            { type: "text", text: "Read image file [2-second.png]" },
            { type: "image", image: "img-2" },
          ],
        }),
    };

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );

    const result = await executeReadUrlRequest(
      "https://x.com/alice/status/1",
      undefined,
      [createHandler()],
      nativeRead,
      fetchImpl,
    );

    expect(result.details).toBeDefined();
    expect(result.details?.tempFilePath).toBeTruthy();

    // First content block is the preview text.
    const firstBlock = result.content[0];
    expect(firstBlock?.type).toBe("text");
    expect(firstBlock && "text" in firstBlock ? firstBlock.text : "").toContain(
      "tweet markdown",
    );
    // Image content blocks follow.
    expect(result.content).toContainEqual({
      type: "text",
      text: "Read image file [1-first.jpg]",
    });
    expect(result.content).toContainEqual({
      type: "image",
      image: "img-1",
    });
    expect(result.details).toMatchObject({
      handler: "twitter",
      imageCount: 2,
      attachedImageCount: 2,
      skippedImageCount: 0,
    });
    expect(nativeRead.execute).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("skips failed images without failing the whole tool", async () => {
    const nativeRead = {
      execute: vi.fn().mockResolvedValue({
        content: [
          { type: "text", text: "Read image file [second]" },
          { type: "image", image: "img-2" },
        ],
      }),
    };

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("nope", {
          status: 500,
          statusText: "Boom",
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );

    const result = await executeReadUrlRequest(
      "https://x.com/alice/status/1",
      undefined,
      [createHandler("markdown only")],
      nativeRead,
      fetchImpl,
    );

    expect(result.details).toBeDefined();
    expect(result.details?.tempFilePath).toBeTruthy();

    const firstBlock = result.content[0];
    expect(firstBlock?.type).toBe("text");
    expect(firstBlock && "text" in firstBlock ? firstBlock.text : "").toContain(
      "markdown only",
    );
    expect(result.content).toContainEqual({
      type: "text",
      text: "Read image file [second]",
    });
    expect(result.details).toMatchObject({
      imageCount: 2,
      attachedImageCount: 1,
      skippedImageCount: 1,
      failed: false,
    });
    expect(nativeRead.execute).toHaveBeenCalledTimes(1);
  });

  it("guesses image extensions from content type and url", () => {
    expect(
      guessImageExtension("image/webp", "https://img.example.com/file"),
    ).toBe(".webp");
    expect(
      guessImageExtension(null, "https://img.example.com/file.jpeg?format=raw"),
    ).toBe(".jpeg");
    expect(guessImageExtension(null, "not-a-url")).toBe(".img");
  });
});

describe("read_url result contract", () => {
  const nativeRead = { execute: vi.fn() };

  function textHandler(markdown: string): ReadUrlHandler {
    return {
      name: "markdown.new",
      matches: () => true,
      fetchData: async (url) => ({
        sourceUrl: url.toString(),
        markdown,
        title: "Docs",
        statusCode: 200,
      }),
    };
  }

  it("returns the full text when content only has the preview", async () => {
    const markdown = Array.from(
      { length: (2 * DEFAULT_PREVIEW_MAX_BYTES) / 100 },
      (_, i) => `${"y".repeat(90)} line ${i}`,
    ).join("\n");

    const result = await executeReadUrlRequest(
      "https://example.com/docs",
      undefined,
      [textHandler(markdown)],
      nativeRead,
    );

    const preview = result.content[0];
    expect(preview && "text" in preview ? preview.text : "").toContain(
      "truncated",
    );
    expectStructuredOutput(
      { name: "read_url", outputSchema: ReadUrlOutputSchema },
      result,
    );
    expect(result.structuredContent).toEqual({
      url: "https://example.com/docs",
      sourceUrl: "https://example.com/docs",
      title: "Docs",
      handler: "markdown.new",
      statusCode: 200,
      markdown,
      truncated: false,
      totalLines: markdown.split("\n").length,
      imageCount: 0,
      attachedImageCount: 0,
      skippedImageCount: 0,
    });
  });

  it("caps the structured text at 1 MiB and points at the full file", async () => {
    const markdown = `${"a".repeat(STRUCTURED_TEXT_MAX_BYTES)}${"b".repeat(1000)}`;

    const result = await executeReadUrlRequest(
      "https://example.com/big",
      undefined,
      [textHandler(markdown)],
      nativeRead,
    );

    expectStructuredOutput(
      { name: "read_url", outputSchema: ReadUrlOutputSchema },
      result,
    );
    const output = result.structuredContent as ReadUrlOutput;
    expect(output.truncated).toBe(true);
    expect(output.tempFilePath).toBe(result.details?.tempFilePath);
    expect(output.markdown.startsWith("a".repeat(1000))).toBe(true);
    expect(output.markdown.endsWith("b".repeat(1000))).toBe(true);
    expect(output.markdown).toContain("[... 1000 bytes omitted ...]");
    assert(output.tempFilePath, "tempFilePath should exist");
    expect(vol.readFileSync(output.tempFilePath, "utf-8")).toBe(markdown);
  });

  it("declares read-only, open-world annotations", async () => {
    const pi = await createPiTestHarness(readUrlExtension);
    const tool = pi.tool("read_url").registered;

    expect(tool.outputSchema).toBe(ReadUrlOutputSchema);
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
    });
  });
});
