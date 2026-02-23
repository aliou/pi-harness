import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function runUpdate(scriptPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      scriptPath,
      args,
      { encoding: "utf8" },
      (error, stdout, stderr) => {
        const out = `${stdout || ""}${stderr || ""}`.trim();
        if (error) {
          reject(new Error(out || error.message));
          return;
        }
        resolve(out);
      },
    );
  });
}

function summarize(output: string): string {
  const oneLine = output.replace(/\s+/g, " ").trim();
  return oneLine.length > 180 ? `${oneLine.slice(0, 177)}...` : oneLine;
}

export function registerDefaultsUpdateCommand(pi: ExtensionAPI): void {
  pi.registerCommand("defaults:update", {
    description: "Update pinned package refs and refresh installed packages",
    handler: async (args, ctx) => {
      const scriptPath = join(homedir(), ".pi", "agent", "bin", "update");
      if (!existsSync(scriptPath)) {
        ctx.ui.notify(`defaults:update missing script: ${scriptPath}`, "error");
        return;
      }

      const extraArgs = args.trim().length > 0 ? args.trim().split(/\s+/) : [];

      try {
        const output = await runUpdate(scriptPath, extraArgs);
        if (output.length > 0) {
          ctx.ui.notify(`defaults:update done: ${summarize(output)}`, "info");
        } else {
          ctx.ui.notify("defaults:update done", "info");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        ctx.ui.notify(`defaults:update failed: ${summarize(message)}`, "error");
      }
    },
  });
}
