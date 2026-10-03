import type { Api, Model } from "@earendil-works/pi-ai";
import {
  DefaultPackageManager,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import { vol } from "memfs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { virtualModelExtensionPaths } from "./virtual-models";

const virtual = {
  provider: "agents",
  id: "scout",
  api: "pi-virtual",
} as Model<Api>;
const root = "/installed/rig";
const routingPath = `${root}/hooks/virtual-models/index.ts`;

afterEach(() => vi.restoreAllMocks());

function resource(path = routingPath, enabled = true): ResolvedResource {
  return {
    path,
    enabled,
    metadata: {
      source: root,
      scope: "user",
      origin: "package",
      packageRoot: root,
    },
  };
}

function seed(name = "@aliou/pi-rig") {
  vol.fromJSON({ [`${root}/package.json`]: JSON.stringify({ name }) });
}

describe("virtualModelExtensionPaths", () => {
  it("does not resolve packages for a physical model", async () => {
    const resolve = vi.fn();
    const paths = await virtualModelExtensionPaths(
      { ...virtual, api: "openai-responses" },
      "/parent",
      "/agent",
      resolve,
    );
    expect(paths).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns only the enabled routing extension's absolute path", async () => {
    seed();
    const resolve = vi.fn(async () => [
      resource(`${root}/hooks/ant/index.ts`),
      resource(),
    ]);
    const paths = await virtualModelExtensionPaths(
      virtual,
      "/parent",
      "/agent",
      resolve,
    );
    expect(paths).toEqual([routingPath]);
    expect(resolve).toHaveBeenCalledWith("/parent", "/agent");
  });

  it("uses installed package resolution and skips missing packages", async () => {
    seed();
    const resolve = vi
      .spyOn(DefaultPackageManager.prototype, "resolve")
      .mockResolvedValue({
        extensions: [resource()],
        skills: [],
        prompts: [],
        themes: [],
      });
    const paths = await virtualModelExtensionPaths(
      virtual,
      "/parent",
      "/agent",
    );
    expect(paths).toEqual([routingPath]);
    const onMissing = resolve.mock.calls[0]?.[0];
    expect(onMissing).toBeTypeOf("function");
    const action = await onMissing?.("npm:missing");
    expect(action).toBe("skip");
  });

  it.each([
    ["missing", []],
    ["disabled", [resource(routingPath, false)]],
    ["unrelated", [resource(`${root}/hooks/ant/index.ts`)]],
    [
      "no package metadata",
      [
        {
          ...resource(),
          metadata: { source: "auto", scope: "user", origin: "top-level" },
        },
      ],
    ],
  ] as const)("fails clearly when the routing extension is %s", async (_label, resources) => {
    seed();
    await expect(
      virtualModelExtensionPaths(
        virtual,
        "/parent",
        "/agent",
        async () => resources,
      ),
    ).rejects.toThrow("Cannot load routing for agents/scout");
  });

  it("rejects a matching relative path owned by another package", async () => {
    seed("other-package");
    await expect(
      virtualModelExtensionPaths(virtual, "/parent", "/agent", async () => [
        resource(),
      ]),
    ).rejects.toThrow("was not found");
  });
});
