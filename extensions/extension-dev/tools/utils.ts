import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Find the currently running Pi installation directory by resolving the
 * pi-coding-agent package location.
 */
export function findPiInstallation(): string | null {
  try {
    const piModulePath = require.resolve(
      "@mariozechner/pi-coding-agent/package.json",
    );
    return path.dirname(piModulePath);
  } catch (_error) {
    const scriptPath = process.argv[1];
    if (scriptPath) {
      let currentDir = path.dirname(scriptPath);

      while (currentDir !== path.dirname(currentDir)) {
        const packageJsonPath = path.join(currentDir, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageContent = fs.readFileSync(packageJsonPath, "utf-8");
            const packageJson = JSON.parse(packageContent);
            if (packageJson.name === "@mariozechner/pi-coding-agent") {
              return currentDir;
            }
          } catch {
            // Continue searching
          }
        }
        currentDir = path.dirname(currentDir);
      }
    }

    return null;
  }
}

/**
 * Resolve ExtensionContext from execute args, compatible with Pi 0.50.x and
 * 0.51.0+.
 *
 * Pi 0.50.x: execute(id, params, onUpdate, ctx, signal)
 * Pi 0.51.0+: execute(id, params, signal, onUpdate, ctx)
 *
 * When compiled against 0.51.0+, the typed params are (signal, onUpdate, ctx).
 * On 0.50.x at runtime, `signal` actually receives the onUpdate callback
 * (a function), `onUpdate` receives ctx, and `ctx` receives signal.
 */
export function resolveCtx(
  signal: AbortSignal | undefined,
  onUpdate: unknown,
  ctx: ExtensionContext,
): ExtensionContext {
  // AbortSignal is never callable; a function here means we got onUpdate (0.50.x)
  if (typeof signal === "function") {
    return onUpdate as ExtensionContext;
  }
  return ctx;
}
