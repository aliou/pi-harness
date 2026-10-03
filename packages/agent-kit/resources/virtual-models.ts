import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  DefaultPackageManager,
  type ResolvedResource,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { isVirtualModel } from "@harness/models";

type ResolveExtensions = (
  cwd: string,
  agentDir: string,
) => Promise<readonly ResolvedResource[]>;

async function resolveInstalledExtensions(
  cwd: string,
  agentDir: string,
): Promise<readonly ResolvedResource[]> {
  const manager = new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
  });
  const resources = await manager.resolve(async () => "skip");
  return resources.extensions;
}

function isRigRoutingExtension(resource: ResolvedResource): boolean {
  if (!resource.enabled) return false;
  const root = resource.metadata.packageRoot;
  if (!root) return false;
  if (
    resolve(resource.path) !== resolve(root, "hooks/virtual-models/index.ts")
  ) {
    return false;
  }
  const manifest = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as {
    name?: string;
  };
  return manifest.name === "@aliou/pi-rig";
}

/** Resolve only the enabled routing extension; never install missing packages. */
export async function virtualModelExtensionPaths(
  model: Model<Api>,
  parentCwd: string,
  agentDir: string,
  resolveExtensions: ResolveExtensions = resolveInstalledExtensions,
): Promise<string[]> {
  if (!isVirtualModel(model)) return [];
  const resources = await resolveExtensions(parentCwd, agentDir);
  const extension = resources.find(isRigRoutingExtension);
  if (!extension) {
    throw new Error(
      `Cannot load routing for ${model.provider}/${model.id}: enabled @aliou/pi-rig hooks/virtual-models/index.ts was not found`,
    );
  }
  return [resolve(extension.path)];
}
