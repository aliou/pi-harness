/**
 * GitHub CLI (gh) wrapper utilities.
 */

import { spawn } from "node:child_process";

/**
 * Run gh CLI command and return stdout.
 */
export async function runGh(
  args: string[],
  signal?: AbortSignal,
  stdin?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
          reject(new Error("Operation aborted"));
        },
        { once: true },
      );
    }

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `gh exited with code ${code}`));
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new Error("gh CLI is not installed"));
      } else {
        reject(err);
      }
    });
  });
}
