import { describe, expect, it } from "vitest";
import type { ProcessInfo } from "../constants";
import { formatRuntime, formatStatus, truncateCmd } from "./format";

describe("formatRuntime", () => {
  it("formats seconds only", () => {
    expect(formatRuntime(0, 5000)).toBe("5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatRuntime(0, 125000)).toBe("2m 5s");
  });

  it("formats hours and minutes (no seconds)", () => {
    expect(formatRuntime(0, 3720000)).toBe("1h 2m");
  });

  it("formats zero seconds", () => {
    expect(formatRuntime(0, 0)).toBe("0s");
  });

  it("uses Date.now() when endTime is null", () => {
    const start = Date.now() - 3000;
    const result = formatRuntime(start, null);
    // Should be around 3s; allow a small margin
    expect(result).toMatch(/^\d+s$/);
  });
});

describe("formatStatus", () => {
  const base: ProcessInfo = {
    id: "1",
    name: "test",
    pid: 100,
    command: "echo",
    cwd: "/",
    startTime: 0,
    endTime: null,
    status: "running",
    exitCode: null,
    success: null,
    stdoutFile: "",
    stderrFile: "",
    alertOnSuccess: false,
    alertOnFailure: false,
    alertOnKill: false,
  };

  it('returns "running" for running status', () => {
    expect(formatStatus({ ...base, status: "running" })).toBe("running");
  });

  it('returns "terminating" for terminating status', () => {
    expect(formatStatus({ ...base, status: "terminating" })).toBe(
      "terminating",
    );
  });

  it('returns "killed" for killed status', () => {
    expect(formatStatus({ ...base, status: "killed" })).toBe("killed");
  });

  it('returns "exit(0)" when exited successfully', () => {
    expect(
      formatStatus({ ...base, status: "exited", success: true, exitCode: 0 }),
    ).toBe("exit(0)");
  });

  it('returns "exit(N)" when exited with non-zero code', () => {
    expect(
      formatStatus({ ...base, status: "exited", success: false, exitCode: 1 }),
    ).toBe("exit(1)");
  });

  it('returns "exit(?)" when exited with null exit code', () => {
    expect(
      formatStatus({
        ...base,
        status: "exited",
        success: false,
        exitCode: null,
      }),
    ).toBe("exit(?)");
  });
});

describe("truncateCmd", () => {
  it("returns a short command as-is", () => {
    expect(truncateCmd("echo hello")).toBe("echo hello");
  });

  it("truncates a long command with ... suffix", () => {
    const cmd = "a".repeat(50);
    const result = truncateCmd(cmd);
    expect(result).toHaveLength(40);
    expect(result.endsWith("...")).toBe(true);
  });

  it("default max is 40 chars", () => {
    const cmd = "a".repeat(45);
    expect(truncateCmd(cmd)).toHaveLength(40);
  });

  it("respects a custom max parameter", () => {
    const cmd = "a".repeat(20);
    const result = truncateCmd(cmd, 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns a string of exactly max length as-is", () => {
    const cmd = "a".repeat(40);
    expect(truncateCmd(cmd)).toBe(cmd);
  });
});
