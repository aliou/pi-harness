import { mkdir, realpath, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { tmpdirTest } from "@harness/test-utils/tmpdir";
import { describe, expect } from "vitest";
import bashExtension from "./index";

describe("bash override", () => {
  tmpdirTest(
    "forwards Pi session context to the delegated bash definition",
    async () => {
      const pi = await createPiTestHarness(bashExtension, {
        toolContext: {
          model: {
            provider: "test-provider",
            id: "test-model",
          } as never,
          thinkingLevel: "high",
        },
      });
      const tool = pi.tool("bash");

      const result = await tool.execute({
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
      const pi = await createPiTestHarness(bashExtension, { cwd: dir });
      await mkdir(join(dir, "nested"));

      const result = await pi.tool("bash").execute({
        command: "pwd -P",
        cwd: "nested",
      });

      expect(result.content).toEqual([
        { type: "text", text: `${join(dir, "nested")}\n` },
      ]);
    },
  );

  tmpdirTest("resolves cwd with spaces", async ({ tmpdir }) => {
    const pi = await createPiTestHarness(bashExtension);
    const dir = join(await realpath(tmpdir), "dir with spaces");
    await mkdir(dir);

    const result = await pi.tool("bash").execute({
      command: "pwd -P",
      cwd: dir,
    });

    expect(result.content).toEqual([{ type: "text", text: `${dir}\n` }]);
  });

  tmpdirTest(
    "expands ~ in cwd, including paths with spaces",
    async ({ tmpdir }) => {
      const pi = await createPiTestHarness(bashExtension);
      const dir = join(await realpath(tmpdir), "space dir");
      await mkdir(dir);
      const homeLink = join(homedir(), ".pi-harness-test-space dir");
      await symlink(dir, homeLink);

      try {
        const result = await pi.tool("bash").execute({
          command: "pwd -P",
          cwd: "~/.pi-harness-test-space dir",
        });

        expect(result.content).toEqual([{ type: "text", text: `${dir}\n` }]);
      } finally {
        await rm(homeLink, { force: true });
      }
    },
  );
});
