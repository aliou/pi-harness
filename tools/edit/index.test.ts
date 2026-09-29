import { join } from "node:path";
import { createCommandContext } from "@harness/test-utils/pi-context";
import { createPiTestHarness } from "@harness/test-utils/pi-test-harness";
import { vol } from "memfs";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import editExtension, { prepareEditArguments } from "./index";
import { pickEditTool, resolveActiveTools } from "./router";

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

// Inject memfs operations into the native edit tool so it reads/writes
// from the in-memory volume instead of the real filesystem.
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<object>();
  const originalCreateEditTool = (actual as Record<string, unknown>)
    .createEditTool as typeof import("@earendil-works/pi-coding-agent").createEditTool;
  const originalCreateEditToolDefinition = (actual as Record<string, unknown>)
    .createEditToolDefinition as typeof import("@earendil-works/pi-coding-agent").createEditToolDefinition;

  const memfsOperations = {
    readFile: (path: string) =>
      vol.promises
        .readFile(path)
        .then((b) => (typeof b === "string" ? Buffer.from(b) : b)),
    writeFile: (path: string, content: string) =>
      vol.promises.writeFile(path, content),
    access: (path: string, mode?: number) => vol.promises.access(path, mode),
  };

  return {
    ...actual,
    createEditTool: (
      cwd: string,
      options?: Parameters<typeof originalCreateEditTool>[1],
    ) =>
      originalCreateEditTool(cwd, {
        ...options,
        operations: memfsOperations as Parameters<
          typeof originalCreateEditTool
        >[1] extends { operations?: infer O } | undefined
          ? O
          : never,
      }),
    createEditToolDefinition: (
      cwd: string,
      options?: Parameters<typeof originalCreateEditToolDefinition>[1],
    ) =>
      originalCreateEditToolDefinition(cwd, {
        ...options,
        operations: memfsOperations as Parameters<
          typeof originalCreateEditToolDefinition
        >[1] extends { operations?: infer O } | undefined
          ? O
          : never,
      }),
  };
});

beforeEach(() => {
  vol.fromJSON({ "/tmp/.keep": "" });
});

describe("defaults edit tool", () => {
  it("registers the edit tool", async () => {
    const pi = await createPiTestHarness(editExtension);

    expect(pi).toHaveRegisteredTool("edit");
  });

  it("does not opt the edit tool into built-in constrained sampling", async () => {
    const pi = await createPiTestHarness(editExtension);

    // Strict validation for the edit tool is layered on the outgoing
    // Anthropic wire payload via the `before_provider_request` hook
    // (see `anthropic/strict.ts`), not via `constrainedSampling`. The
    // registered schema stays non-strict so other providers keep tolerating
    // stray keys (upstream pi #5501).
    expect(pi.tool("edit").registered.constrainedSampling).toBeUndefined();
  });

  it("strips empty-string edits in prepareArguments", async () => {
    const pi = await createPiTestHarness(editExtension);
    const tool = pi.tool("edit").registered;
    assert(tool.prepareArguments, "prepareArguments should be defined");

    const prepared = tool.prepareArguments({
      path: "file.txt",
      edits: [
        {
          oldText: "before",
          newText: "after",
        },
        "",
        {
          oldText: "alpha",
          newText: "beta",
        },
      ],
    });

    expect(prepared).toEqual({
      path: "file.txt",
      edits: [
        {
          oldText: "before",
          newText: "after",
        },
        {
          oldText: "alpha",
          newText: "beta",
        },
      ],
    });
  });

  it("calls native prepareArguments after sanitizing args", () => {
    const nativePrepareArguments = vi.fn((args) => ({
      ...args,
      path: "prepared.txt",
    }));

    const prepared = prepareEditArguments(
      {
        path: "file.txt",
        edits: [
          {
            oldText: "before",
            newText: "after",
          },
          "",
        ],
      },
      nativePrepareArguments,
    );

    expect(nativePrepareArguments).toHaveBeenCalledWith({
      path: "file.txt",
      edits: [
        {
          oldText: "before",
          newText: "after",
        },
      ],
    });
    expect(prepared).toEqual({
      path: "prepared.txt",
      edits: [
        {
          oldText: "before",
          newText: "after",
        },
      ],
    });
  });

  it("keeps native edit behavior after sanitizing args", async () => {
    const pi = await createPiTestHarness(editExtension);
    const tool = pi.tool("edit");
    const registered = tool.registered;
    assert(registered.prepareArguments, "prepareArguments should be defined");

    const cwd = "/tmp/pi-edit-tool-cwd";
    vol.mkdirSync(cwd, { recursive: true });

    const relativePath = "sample.txt";
    const absolutePath = join(cwd, relativePath);
    vol.writeFileSync(absolutePath, "hello\nworld\n");

    const prepared = registered.prepareArguments({
      path: absolutePath,
      edits: [
        {
          oldText: "world",
          newText: "pi",
        },
        "",
      ],
    });

    const result = await tool.execute(prepared, { cwd });

    const content = vol.readFileSync(absolutePath, "utf8") as string;

    expect(content).toBe("hello\npi\n");
    expect(result.details).toMatchObject({
      diff: expect.stringContaining("+2 pi"),
    });
  });
});

describe("tool registration", () => {
  it("registers both edit and apply_patch", async () => {
    const pi = await createPiTestHarness(editExtension);
    expect(pi).toHaveRegisteredTool("edit");
    expect(pi).toHaveRegisteredTool("apply_patch");
  });
});

function toolProperties(pi: Awaited<ReturnType<typeof createPiTestHarness>>) {
  return (
    pi.tool("edit").registered.parameters as {
      properties: Record<string, unknown>;
    }
  ).properties;
}

async function routeModel(
  pi: Awaited<ReturnType<typeof createPiTestHarness>>,
  model: { provider: string; id: string },
  activeTools = ["read", "edit", "write", "bash"],
) {
  pi.runtime.getActiveTools = vi.fn(() => activeTools);
  pi.runtime.setActiveTools = vi.fn();
  const handler = pi.extension.handlers.get("model_select")?.[0];
  assert(handler, "model_select handler should be registered");
  await handler(
    { type: "model_select", model },
    createCommandContext({
      model: model as NonNullable<
        Parameters<typeof createCommandContext>[0]
      >["model"],
    }),
  );
}

describe("kimi edit tool", () => {
  async function kimiTool() {
    const pi = await createPiTestHarness(editExtension);
    await routeModel(pi, { provider: "neuralwatt", id: "kimi-k2.7-code" });
    return pi.tool("edit");
  }

  it("replaces a unique occurrence", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    const absolutePath = join(cwd, "sample.txt");
    vol.writeFileSync(absolutePath, "hello\nworld\n");

    const result = await tool.execute(
      {
        path: "sample.txt",
        old_string: "world",
        new_string: "kimi",
      },
      { cwd },
    );

    expect(vol.readFileSync(absolutePath, "utf8")).toBe("hello\nkimi\n");
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Replaced 1 occurrence in sample.txt.",
    });
    expect(result.details).toMatchObject({
      diff: expect.stringContaining("+2 kimi"),
    });
  });

  it("rejects empty old_string and no-op edits", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    vol.writeFileSync(join(cwd, "sample.txt"), "hello\n");

    await expect(
      tool.execute(
        { path: "sample.txt", old_string: "", new_string: "x" },
        { cwd },
      ),
    ).rejects.toThrow("old_string must not be empty");

    await expect(
      tool.execute(
        { path: "sample.txt", old_string: "hello", new_string: "hello" },
        { cwd },
      ),
    ).rejects.toThrow("No changes to make");
  });

  it("requires unique old_string unless replace_all is true", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    const absolutePath = join(cwd, "sample.txt");
    vol.writeFileSync(absolutePath, "same\nother\nsame\n");

    await expect(
      tool.execute(
        { path: "sample.txt", old_string: "same", new_string: "new" },
        { cwd },
      ),
    ).rejects.toThrow("old_string is not unique");

    await tool.execute(
      {
        path: "sample.txt",
        old_string: "same",
        new_string: "new",
        replace_all: true,
      },
      { cwd },
    );

    expect(vol.readFileSync(absolutePath, "utf8")).toBe("new\nother\nnew\n");
  });

  it("rejects relative paths that escape cwd", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    vol.writeFileSync("/tmp/outside.txt", "secret\n");

    await expect(
      tool.execute(
        { path: "../outside.txt", old_string: "secret", new_string: "x" },
        { cwd },
      ),
    ).rejects.toThrow("escapes the working directory");
  });

  it("matches LF view and preserves pure CRLF files", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    const absolutePath = join(cwd, "sample.txt");
    vol.writeFileSync(absolutePath, "alpha\r\nbeta\r\n");

    await tool.execute(
      {
        path: "sample.txt",
        old_string: "alpha\nbeta",
        new_string: "one\ntwo",
      },
      { cwd },
    );

    expect(vol.readFileSync(absolutePath, "utf8")).toBe("one\r\ntwo\r\n");
  });

  it("serializes concurrent edits to the same file", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    const absolutePath = join(cwd, "sample.txt");
    vol.writeFileSync(absolutePath, "alpha\nbeta\n");

    await Promise.all([
      tool.execute(
        { path: "sample.txt", old_string: "alpha", new_string: "ALPHA" },
        { cwd },
      ),
      tool.execute(
        { path: "sample.txt", old_string: "beta", new_string: "BETA" },
        { cwd },
      ),
    ]);

    expect(vol.readFileSync(absolutePath, "utf8")).toBe("ALPHA\nBETA\n");
  });

  it("does not mutate when already aborted", async () => {
    const tool = await kimiTool();
    const cwd = "/tmp/kimi-edit-cwd";
    vol.mkdirSync(cwd, { recursive: true });
    const absolutePath = join(cwd, "sample.txt");
    vol.writeFileSync(absolutePath, "before\n");
    const controller = new AbortController();
    controller.abort();

    await expect(
      tool.execute(
        { path: "sample.txt", old_string: "before", new_string: "after" },
        { cwd, signal: controller.signal },
      ),
    ).rejects.toThrow();

    expect(vol.readFileSync(absolutePath, "utf8")).toBe("before\n");
  });
});

describe("routing", () => {
  it("picks model-specific edit interfaces", () => {
    expect(pickEditTool({ provider: "openai-codex", id: "gpt-5.5" })).toBe(
      "apply_patch",
    );
    // A gpt-5* id under a non-Codex provider is NOT enough to route to
    // apply_patch -- only the `openai-codex` provider is. This guards against
    // silently stripping edit/write from a model that was not V4A-trained.
    expect(pickEditTool({ provider: "synthetic", id: "gpt-5.4" })).toBe("edit");
    expect(pickEditTool({ provider: "anthropic", id: "claude-opus-4-8" })).toBe(
      "edit",
    );
    expect(pickEditTool({ provider: "neuralwatt", id: "kimi-k2.7-code" })).toBe(
      "kimi_edit",
    );
    expect(
      pickEditTool({
        provider: "synthetic",
        id: "hf:moonshotai/Kimi-K2.7-Code",
      }),
    ).toBe("kimi_edit");
    expect(
      pickEditTool({ provider: "synthetic", id: "hf:zai-org/GLM-5.2" }),
    ).toBe("edit");
    expect(pickEditTool(undefined)).toBe("edit");
  });

  it("entering codex drops edit+write and adds apply_patch", () => {
    const result = resolveActiveTools(
      ["read", "edit", "write", "bash"],
      "apply_patch",
      [],
    );
    expect(result.active).toEqual(["read", "bash", "apply_patch"]);
    expect(result.removedByUs).toEqual(["edit", "write"]);
  });

  it("leaving codex restores removed tools and drops apply_patch", () => {
    const result = resolveActiveTools(["read", "bash", "apply_patch"], "edit", [
      "edit",
      "write",
    ]);
    expect(result.active).toEqual(["read", "bash", "edit", "write"]);
    expect(result.removedByUs).toEqual([]);
  });

  it("entering kimi keeps edit/write and drops apply_patch", () => {
    const result = resolveActiveTools(
      ["read", "edit", "write", "bash", "apply_patch"],
      "kimi_edit",
      [],
    );
    expect(result.active).toEqual(["read", "edit", "write", "bash"]);
    expect(result.removedByUs).toEqual([]);
  });

  it("entering kimi from codex restores edit/write", () => {
    const result = resolveActiveTools(
      ["read", "bash", "apply_patch"],
      "kimi_edit",
      ["edit", "write"],
    );
    expect(result.active).toEqual(["read", "bash", "edit", "write"]);
    expect(result.removedByUs).toEqual([]);
  });

  it("first route on a non-codex model ensures edit is active", () => {
    const result = resolveActiveTools(["read", "bash"], "edit", []);
    expect(result.active).toContain("edit");
    expect(result.active).not.toContain("apply_patch");
  });

  it("overloads edit with the kimi schema for kimi models", async () => {
    const pi = await createPiTestHarness(editExtension);

    await routeModel(pi, { provider: "neuralwatt", id: "kimi-k2.7-code" });

    const properties = toolProperties(pi);
    expect(properties.old_string).toBeDefined();
    expect(properties.new_string).toBeDefined();
    expect(properties.edits).toBeUndefined();
  });

  it("restores the default edit schema when leaving kimi", async () => {
    const pi = await createPiTestHarness(editExtension);

    await routeModel(pi, { provider: "neuralwatt", id: "kimi-k2.7-code" });
    await routeModel(pi, { provider: "anthropic", id: "claude-opus-4-8" });

    const properties = toolProperties(pi);
    expect(properties.edits).toBeDefined();
    expect(properties.old_string).toBeUndefined();
  });
});
