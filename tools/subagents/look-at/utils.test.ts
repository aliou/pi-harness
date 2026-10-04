import { join } from "node:path";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectSupportedImageMimeType, referencesImageFiles } from "./utils";

vi.mock("node:os", () => ({
  homedir: () => "/home/user",
}));

const PNG_SIG = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
];

const JPG_SIG = [0xff, 0xd8, 0xff, 0xe0];

beforeEach(() => {
  vol.fromJSON({ "/tmp/.keep": "" });
});

describe("referencesImageFiles", () => {
  it("detects an existing .png file path", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(join(dir, "test.png"), Buffer.from(PNG_SIG));
    const path = join(dir, "test.png");
    expect(referencesImageFiles(`check out ${path}`, "/tmp")).toBe(true);
  });

  it("detects an existing .jpg file path", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(join(dir, "photo.jpg"), Buffer.from(JPG_SIG));
    const path = join(dir, "photo.jpg");
    expect(referencesImageFiles(`look at ${path}`, "/tmp")).toBe(true);
  });

  it("detects an existing relative path", () => {
    const dir = "/tmp/pi-test-rel";
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(join(dir, "image.png"), Buffer.from(PNG_SIG));
    const relPath = "image.png";
    expect(referencesImageFiles(`check ${relPath}`, dir)).toBe(true);
  });

  it("detects existing path with spaces (macOS screenshot style)", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    const fileName = "Screenshot 2026-03-01 at 08.49.52 PM@2x.png";
    vol.writeFileSync(join(dir, fileName), Buffer.from(PNG_SIG));
    const fullPath = join(dir, fileName);
    expect(
      referencesImageFiles(
        `why does it break? ${fullPath} on submit it showed mine`,
        "/tmp",
      ),
    ).toBe(true);
  });

  it("does NOT match a non-existent path", () => {
    expect(
      referencesImageFiles("/Users/nonexistent/nope/screenshot.png", "/tmp"),
    ).toBe(false);
  });

  it("does NOT match a URL with .png", () => {
    expect(
      referencesImageFiles("curl https://example.com/assets/logo.png", "/tmp"),
    ).toBe(false);
  });

  it("does NOT match .png in prose without a real file", () => {
    expect(
      referencesImageFiles("I converted the PNG data to base64", "/tmp"),
    ).toBe(false);
  });

  it("does NOT match non-image extensions", () => {
    expect(referencesImageFiles("read src/index.ts", "/tmp")).toBe(false);
  });

  it("does NOT match empty string", () => {
    expect(referencesImageFiles("", "/tmp")).toBe(false);
  });

  it("does NOT match .json or .md paths", () => {
    expect(referencesImageFiles("read package.json", "/tmp")).toBe(false);
    expect(referencesImageFiles("read README.md", "/tmp")).toBe(false);
  });

  it("does NOT match svg extension", () => {
    expect(referencesImageFiles("the logo is at assets/logo.svg", "/tmp")).toBe(
      false,
    );
  });

  it("handles .bmp extension", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    const bmp = Buffer.alloc(58);
    bmp.write("BM", 0, "ascii");
    bmp.writeUInt32LE(58, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(1, 18);
    bmp.writeInt32LE(1, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(0, 30);
    bmp.writeUInt32LE(4, 34);
    vol.writeFileSync(join(dir, "diagram.bmp"), bmp);
    const path = join(dir, "diagram.bmp");
    expect(referencesImageFiles(`check ${path}`, "/tmp")).toBe(true);
  });

  it("does NOT match text without file refs", () => {
    expect(referencesImageFiles("just some text", "/tmp")).toBe(false);
  });

  it("handles .webp extension", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(
      join(dir, "diagram.webp"),
      Buffer.from("RIFFxxxxWEBP", "ascii"),
    );
    const path = join(dir, "diagram.webp");
    expect(referencesImageFiles(`check ${path}`, "/tmp")).toBe(true);
  });

  it("handles .gif extension", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(join(dir, "demo.gif"), Buffer.from("GIF89a", "ascii"));
    const path = join(dir, "demo.gif");
    expect(referencesImageFiles(`look at ${path}`, "/tmp")).toBe(true);
  });

  it("handles .jpeg extension", () => {
    const dir = "/home/user/pi-test";
    vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(join(dir, "photo.jpeg"), Buffer.from(JPG_SIG));
    const path = join(dir, "photo.jpeg");
    expect(referencesImageFiles(`check ${path}`, "/tmp")).toBe(true);
  });

  it("does not match .png inside a curl URL that happens to include a local path", () => {
    expect(
      referencesImageFiles(
        `curl 'https://code.378labs.dev/user/repo/actions/runs/2/jobs/0/attempt/1/logs' -H 'Accept: text/html' && curl 'https://code.378labs.dev/assets/logo.png'`,
        "/tmp",
      ),
    ).toBe(false);
  });
});

describe("detectSupportedImageMimeType", () => {
  it.each([
    {
      desc: "png",
      input: Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049444154",
        "hex",
      ),
      expected: "image/png",
    },
    {
      desc: "jpeg",
      input: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      expected: "image/jpeg",
    },
    {
      desc: "gif",
      input: Buffer.from("GIF89a", "ascii"),
      expected: "image/gif",
    },
    {
      desc: "webp",
      input: Buffer.from("RIFFxxxxWEBP", "ascii"),
      expected: "image/webp",
    },
    {
      desc: "bmp",
      input: (() => {
        const buffer = Buffer.alloc(58);
        buffer.write("BM", 0, "ascii");
        buffer.writeUInt32LE(58, 2);
        buffer.writeUInt32LE(54, 10);
        buffer.writeUInt32LE(40, 14);
        buffer.writeInt32LE(1, 18);
        buffer.writeInt32LE(1, 22);
        buffer.writeUInt16LE(1, 26);
        buffer.writeUInt16LE(24, 28);
        buffer.writeUInt32LE(0, 30);
        buffer.writeUInt32LE(4, 34);
        return buffer;
      })(),
      expected: "image/bmp",
    },
  ])("detects $desc", ({ input, expected }) => {
    expect(detectSupportedImageMimeType(input)).toBe(expected);
  });

  it("rejects h264 bytes mislabeled as png by extension", () => {
    const h264Bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x01, 0x67, 0x64, 0x00, 0x2a,
    ]);

    expect(detectSupportedImageMimeType(h264Bytes)).toBeNull();
  });

  it("rejects invalid png signature without IHDR", () => {
    const invalidPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    expect(detectSupportedImageMimeType(invalidPng)).toBeNull();
  });
});
