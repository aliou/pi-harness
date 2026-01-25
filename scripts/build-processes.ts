import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const processesDir = path.join(repoRoot, "extensions", "processes");
const distDir = path.join(processesDir, "dist");
const vendorDir = path.join(distDir, "vendor", "tui-utils");
const tuiUtilsDir = path.join(repoRoot, "packages", "tui-utils");

const skipEntries = new Set([
  "dist",
  "vendor",
  "node_modules",
  "package.json",
  "README.md",
  "test",
]);

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (skipEntries.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await copyDir(processesDir, distDir);

  await mkdir(vendorDir, { recursive: true });
  await copyFile(
    path.join(tuiUtilsDir, "index.ts"),
    path.join(vendorDir, "index.ts"),
  );

  const commandsPath = path.join(distDir, "commands", "index.ts");
  const commandsSource = await readFile(commandsPath, "utf8");
  const rewritten = commandsSource.replace(
    'from "@aliou/tui-utils";',
    'from "../vendor/tui-utils/index.ts";',
  );

  if (rewritten === commandsSource) {
    throw new Error("Expected @aliou/tui-utils import not found in commands.");
  }

  await writeFile(commandsPath, rewritten);
  console.log("Built processes dist with vendored tui-utils.");
}

await main();
