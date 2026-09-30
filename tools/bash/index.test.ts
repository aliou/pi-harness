import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { expectStructuredOutput } from "@harness/test-utils/structured-output";
import { tmpdirTest } from "@harness/test-utils/tmpdir";
import { describe, expect, it, vi } from "vitest";
import bashExtension from "./index";

vi.unmock("node:fs");
vi.unmock("node:fs/promises");

describe("bash override", () => {
  tmpdirTest(
    "forwards Pi session context to the native bash tool",
    async ({ tmpdir }) => {
      const pi = await createPiTestHarness(bashExtension, {
        cwd: tmpdir,
        toolContext: {
          model: { provider: "test-provider", id: "test-model" } as never,
          thinkingLevel: "high",
        },
      });

      const result = await pi.tool("bash").execute({
        command:
          'printf "%s|%s|%s|%s|%s" "$PI_SESSION_ID" "$PI_SESSION_FILE" "$PI_PROVIDER" "$PI_MODEL" "$PI_REASONING_LEVEL"',
      });

      expect(result.content).toEqual([
        {
          type: "text",
          text: "stub-session-id||test-provider|test-model|high",
        },
      ]);
    },
  );

  tmpdirTest("runs in the session cwd by default", async ({ tmpdir }) => {
    const dir = await realpath(tmpdir);
    const pi = await createPiTestHarness(bashExtension, { cwd: dir });

    const result = await pi.tool("bash").execute({ command: "pwd -P" });

    expect(result.content).toEqual([{ type: "text", text: `${dir}\n` }]);
  });

  tmpdirTest(
    "resolves a relative cwd against the session cwd",
    async ({ tmpdir }) => {
      const dir = await realpath(tmpdir);
      const nested = join(dir, "nested");
      await mkdir(nested);
      const pi = await createPiTestHarness(bashExtension, { cwd: dir });

      const result = await pi.tool("bash").execute({
        command: "pwd -P",
        cwd: "nested",
      });

      expect(result.content).toEqual([{ type: "text", text: `${nested}\n` }]);
    },
  );

  tmpdirTest("resolves cwd with spaces", async ({ tmpdir }) => {
    const dir = join(await realpath(tmpdir), "dir with spaces");
    await mkdir(dir);
    const pi = await createPiTestHarness(bashExtension, { cwd: tmpdir });

    const result = await pi.tool("bash").execute({
      command: "pwd -P",
      cwd: dir,
    });

    expect(result.content).toEqual([{ type: "text", text: `${dir}\n` }]);
  });

  tmpdirTest("expands ~ to the home directory", async ({ tmpdir }) => {
    const pi = await createPiTestHarness(bashExtension, { cwd: tmpdir });

    const result = await pi.tool("bash").execute({
      command: "pwd -P",
      cwd: "~",
    });

    expect(result.content).toEqual([
      { type: "text", text: `${await realpath(homedir())}\n` },
    ]);
  });
});

describe("bash tool result contract", () => {
  tmpdirTest("keeps pi's structured output", async ({ tmpdir }) => {
    const pi = await createPiTestHarness(bashExtension, { cwd: tmpdir });
    const tool = pi.tool("bash");

    const result = await tool.execute({ command: "printf hi" });

    expectStructuredOutput(tool.registered, result);
    expect(result.structuredContent).toMatchObject({
      output: "hi",
      truncated: false,
      exit_code: 0,
    });
  });

  it("declares destructive, open-world annotations", async () => {
    const pi = await createPiTestHarness(bashExtension);

    expect(pi.tool("bash").registered.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });
});
