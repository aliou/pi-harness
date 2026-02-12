#!/usr/bin/env node
/**
 * Validates that public packages do not depend on private workspace packages.
 * Prevents accidental imports of unpublished packages in published packages.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "..");

/**
 * Determine if a package is public based on package.json
 * @param {object} pkg - package.json contents
 * @returns {boolean} - true if public, false if private
 */
function isPublic(pkg) {
	// Explicitly marked as private
	if (pkg.private === true) {
		return false;
	}

	// Explicitly marked as public
	if (pkg.private === false) {
		return true;
	}

	// Has publishConfig.access = public
	if (pkg.publishConfig?.access === "public") {
		return true;
	}

	// Root package is typically private even without explicit flag
	if (pkg.name === "@aliou/pi-extensions") {
		return false;
	}

	// Default: if not marked private and not root, consider it private for safety
	// (packages should explicitly opt into being public)
	return false;
}

/**
 * Extract workspace dependencies from package.json dependencies
 * @param {object} deps - dependencies object
 * @returns {string[]} - list of workspace dependency names
 */
function getWorkspaceDeps(deps) {
	if (!deps) return [];
	return Object.entries(deps)
		.filter(([_, version]) => version.startsWith("workspace:"))
		.map(([name]) => name);
}

/**
 * Find all packages in workspace directories
 * @returns {Array<{name: string, dir: string, manifest: object}>}
 */
function findWorkspacePackages() {
	const packages = [];
	const workspaceDirs = ["extensions", "packages", "themes"];

	for (const dir of workspaceDirs) {
		const dirPath = join(workspaceRoot, dir);
		try {
			const entries = readdirSync(dirPath);
			for (const entry of entries) {
				const pkgDir = join(dirPath, entry);
				const pkgJsonPath = join(pkgDir, "package.json");

				try {
					// Check if this is a directory with a package.json
					if (!statSync(pkgDir).isDirectory()) continue;
					const manifest = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

					packages.push({
						name: manifest.name,
						dir: pkgDir,
						manifest,
					});
				} catch {
					// Skip entries without valid package.json
					continue;
				}
			}
		} catch {
			// Skip workspace dirs that don't exist
			continue;
		}
	}

	return packages;
}

async function main() {
	// Find all packages in the workspace
	const packages = findWorkspacePackages();

	// Build a map of package name -> package info
	const packageMap = new Map();
	for (const pkg of packages) {
		packageMap.set(pkg.name, {
			name: pkg.name,
			dir: pkg.dir,
			isPublic: isPublic(pkg.manifest),
			manifest: pkg.manifest,
		});
	}

	console.log(`Found ${packages.length} packages in workspace\n`);

	// Check each public package
	const errors = [];
	for (const [name, pkg] of packageMap.entries()) {
		if (!pkg.isPublic) continue;

		// Get all workspace dependencies (including dev and peer)
		const allDeps = [
			...getWorkspaceDeps(pkg.manifest.dependencies),
			...getWorkspaceDeps(pkg.manifest.devDependencies),
			...getWorkspaceDeps(pkg.manifest.peerDependencies),
		];

		// Check if any are private
		for (const depName of allDeps) {
			const depPkg = packageMap.get(depName);
			if (!depPkg) {
				console.warn(
					`Warning: ${name} depends on ${depName} but it's not in the workspace`,
				);
				continue;
			}

			if (!depPkg.isPublic) {
				errors.push({
					publicPkg: name,
					privateDep: depName,
					publicDir: pkg.dir,
					privateDir: depPkg.dir,
				});
			}
		}
	}

	// Report results
	if (errors.length === 0) {
		console.log("All public packages have valid dependencies");
		process.exit(0);
	}

	console.error("ERROR: Found public packages depending on private packages:\n");
	for (const error of errors) {
		console.error(`  ${error.publicPkg}`);
		console.error(`    depends on: ${error.privateDep} (private)`);
		console.error(`    location: ${error.publicDir.replace(workspaceRoot, ".")}`);
		console.error();
	}

	console.error(
		"Public packages cannot depend on private workspace packages because those dependencies won't be available on npm.",
	);
	console.error(
		"\nTo fix this, either:\n" +
			"  1. Make the dependency public (remove 'private: true' and add 'publishConfig: { access: \"public\" }')\n" +
			"  2. Make the dependent package private (add 'private: true')\n" +
			"  3. Remove the dependency\n",
	);

	process.exit(1);
}

main().catch((error) => {
	console.error("Failed to check public dependencies:", error);
	process.exit(1);
});
