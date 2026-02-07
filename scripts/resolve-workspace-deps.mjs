#!/usr/bin/env node
//
// Postinstall script: ensures internal workspace packages (packages/*) are
// available in node_modules when installed outside of pnpm (e.g. via pi's
// `npm install` after git clone).
//
// How it works:
// 1. Reads all package names from packages/*/package.json
// 2. Scans extension source files for imports matching those names
// 3. If the package isn't already in node_modules, symlinks it and warns
//
// This is a fallback for non-pnpm installs. Under pnpm workspaces, the
// packages are linked automatically.

import { readdirSync, readFileSync, existsSync, mkdirSync, symlinkSync, lstatSync } from "fs";
import { join, dirname, resolve } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PACKAGES_DIR = join(ROOT, "packages");
const EXTENSIONS_DIR = join(ROOT, "extensions");
const NODE_MODULES = join(ROOT, "node_modules");

// 1. Build map: package name -> local path
const localPackages = new Map();
for (const dir of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name) {
    localPackages.set(pkg.name, join(PACKAGES_DIR, dir.name));
  }
}

// 2. Scan extension source files for imports of local packages
const usedPackages = new Set();
function scanDir(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      const content = readFileSync(full, "utf8");
      for (const name of localPackages.keys()) {
        // Match import/require of the package name
        if (content.includes(`"${name}"`) || content.includes(`'${name}'`)) {
          usedPackages.add(name);
        }
      }
    }
  }
}
scanDir(EXTENSIONS_DIR);

// 3. Ensure used packages are in node_modules, symlink if missing
for (const name of usedPackages) {
  const target = localPackages.get(name);
  // Resolve scoped package path: @scope/pkg -> node_modules/@scope/pkg
  const nmPath = join(NODE_MODULES, ...name.split("/"));

  if (existsSync(nmPath)) continue;

  // Ensure parent dir exists (for scoped packages)
  mkdirSync(dirname(nmPath), { recursive: true });
  symlinkSync(target, nmPath, "dir");
  console.warn(
    `[resolve-workspace-deps] "${name}" is not published to npm. Symlinked from ${target}`
  );
}
