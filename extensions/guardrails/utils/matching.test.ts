import { describe, expect, it } from "vitest";
import {
  compileCommandPattern,
  compileCommandPatterns,
  compileFilePattern,
  compileFilePatterns,
  globToRegex,
} from "./matching";

describe("globToRegex", () => {
  it("matches * against non-slash chars", () => {
    const re = globToRegex("*.env");
    expect(re.test("foo.env")).toBe(true);
    expect(re.test(".env")).toBe(true);
  });

  it("does not match * across path separators", () => {
    const re = globToRegex("*.env");
    expect(re.test("foo/bar.env")).toBe(false);
  });

  it("matches ? against a single non-slash char", () => {
    const re = globToRegex("?oo");
    expect(re.test("foo")).toBe(true);
    expect(re.test("fo")).toBe(false);
  });

  it("matches .env* against .env, .env.local, .env.production", () => {
    const re = globToRegex(".env*");
    expect(re.test(".env")).toBe(true);
    expect(re.test(".env.local")).toBe(true);
    expect(re.test(".env.production")).toBe(true);
  });

  it("escapes special regex chars so they match literally", () => {
    const re = globToRegex("file(1).txt");
    expect(re.test("file(1).txt")).toBe(true);
    expect(re.test("fileX1Xtxt")).toBe(false);
  });

  it("is case insensitive", () => {
    const re = globToRegex("*.ENV");
    expect(re.test("foo.env")).toBe(true);
    expect(re.test("foo.Env")).toBe(true);
  });
});

describe("compileFilePattern", () => {
  it("default glob mode matches against basename", () => {
    const p = compileFilePattern({ pattern: "*.env" });
    expect(p.test("/path/to/.env")).toBe(true);
    expect(p.test("/path/to/config.env")).toBe(true);
  });

  it("default glob mode does not match directory components", () => {
    const p = compileFilePattern({ pattern: "*.env" });
    // basename is "file.txt", not *.env
    expect(p.test("/env/file.txt")).toBe(false);
  });

  it("regex mode matches against full path", () => {
    const p = compileFilePattern({ pattern: "secret", regex: true });
    expect(p.test("/path/to/secret/file.txt")).toBe(true);
    expect(p.test("/path/to/public/file.txt")).toBe(false);
  });

  it("invalid regex returns a pattern that never matches", () => {
    const p = compileFilePattern({ pattern: "[invalid", regex: true });
    expect(p.test("anything")).toBe(false);
  });

  it("stores the source config", () => {
    const config = { pattern: "*.ts" };
    const p = compileFilePattern(config);
    expect(p.source).toBe(config);
  });
});

describe("compileCommandPattern", () => {
  it("default substring mode matches when pattern is contained in command", () => {
    const p = compileCommandPattern({ pattern: "rm -rf" });
    expect(p.test("sudo rm -rf /")).toBe(true);
  });

  it("default substring mode does not match when pattern is absent", () => {
    const p = compileCommandPattern({ pattern: "rm -rf" });
    expect(p.test("remove -rf")).toBe(false);
  });

  it("regex mode matches against the full command string", () => {
    const p = compileCommandPattern({ pattern: "^sudo\\s+rm", regex: true });
    expect(p.test("sudo rm -rf /")).toBe(true);
    expect(p.test("rm -rf /")).toBe(false);
  });

  it("regex mode is case sensitive", () => {
    const p = compileCommandPattern({ pattern: "rm", regex: true });
    expect(p.test("RM")).toBe(false);
  });

  it("invalid regex returns a pattern that never matches", () => {
    const p = compileCommandPattern({ pattern: "[bad", regex: true });
    expect(p.test("anything")).toBe(false);
  });

  it("stores the source config", () => {
    const config = { pattern: "rm" };
    const p = compileCommandPattern(config);
    expect(p.source).toBe(config);
  });
});

describe("compileFilePatterns", () => {
  it("returns an array of compiled patterns", () => {
    const patterns = compileFilePatterns([
      { pattern: "*.env" },
      { pattern: "*.key" },
    ]);
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.test("/path/.env")).toBe(true);
    expect(patterns[1]?.test("/path/id_rsa.key")).toBe(true);
  });
});

describe("compileCommandPatterns", () => {
  it("returns an array of compiled patterns", () => {
    const patterns = compileCommandPatterns([
      { pattern: "rm -rf" },
      { pattern: "dd if=" },
    ]);
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.test("rm -rf /")).toBe(true);
    expect(patterns[1]?.test("dd if=/dev/zero of=/dev/sda")).toBe(true);
  });
});
