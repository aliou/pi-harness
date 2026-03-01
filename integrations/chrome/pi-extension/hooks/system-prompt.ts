import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function registerSystemPromptHook(pi: ExtensionAPI): void {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const promptPath = join(baseDir, "..", "system-prompt.txt");
  const browserPrompt = readFileSync(promptPath, "utf8");

  pi.on("before_agent_start", async () => ({
    systemPrompt: browserPrompt,
  }));
}
