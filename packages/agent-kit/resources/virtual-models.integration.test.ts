import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { virtualModelExtensionPaths } from "./virtual-models";

// Pi's externalized SDK reads the real filesystem, not the suite's memfs.
vi.unmock("node:fs");
vi.unmock("node:fs/promises");

describe("installed virtual routing discovery", () => {
  it("finds only the routing extension through Pi's real package resolver", async () => {
    const directory = mkdtempSync(join(tmpdir(), "virtual-routing-"));
    const agentDir = join(directory, "agent");
    const root = join(directory, "rig");
    const cwd = join(directory, "parent");
    const path = join(root, "hooks/virtual-models/index.ts");
    try {
      mkdirSync(agentDir, { recursive: true });
      mkdirSync(cwd, { recursive: true });
      mkdirSync(join(root, "hooks/virtual-models"), { recursive: true });
      mkdirSync(join(root, "hooks/ant"), { recursive: true });
      writeFileSync(
        join(agentDir, "settings.json"),
        JSON.stringify({ packages: [root] }),
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "@aliou/pi-rig",
          pi: { extensions: ["./hooks"] },
        }),
      );
      writeFileSync(path, "export default function () {}");
      writeFileSync(
        join(root, "hooks/ant/index.ts"),
        "export default function () {}",
      );
      const model = {
        provider: "agents",
        id: "scout",
        api: "pi-virtual",
      } as Model<Api>;
      const paths = await virtualModelExtensionPaths(model, cwd, agentDir);
      expect(paths).toEqual([path]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
