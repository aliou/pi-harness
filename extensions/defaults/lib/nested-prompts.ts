import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Register custom commands from nested prompt directories.
 *
 * Scans .pi/prompts/<category>/<command>.md and registers commands as `category:command`.
 * When invoked, sends the markdown file content as a prompt to the LLM.
 *
 * This differs from Pi's standard prompts (which are directly under .pi/prompts/).
 */
export async function registerNestedPrompts(pi: ExtensionAPI) {
  const projectRoot = process.cwd();
  const piDir = join(projectRoot, ".pi");
  if (!existsSync(piDir)) {
    return;
  }

  const promptsDir = join(piDir, "prompts");
  if (!existsSync(promptsDir)) {
    return;
  }

  try {
    const categories = await readdir(promptsDir, { withFileTypes: true });

    for (const category of categories) {
      if (!category.isDirectory()) {
        continue;
      }

      const categoryPath = join(promptsDir, category.name);
      const files = await readdir(categoryPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".md")) {
          continue;
        }

        const commandName = file.name.replace(/\.md$/, "");
        const fullCommand = `${category.name}:${commandName}`;
        const filePath = join(categoryPath, file.name);

        pi.registerCommand(fullCommand, {
          description: `Run prompt: ${fullCommand}`,
          handler: async (_args, ctx) => {
            try {
              const content = await readFile(filePath, "utf-8");
              pi.sendMessage({
                customType: "",
                content,
                display: false,
              });
            } catch (error) {
              ctx.ui.notify(`Failed to read prompt file: ${error}`, "error");
            }
          },
        });
      }
    }
  } catch {
    // Silently fail if prompts directory doesn't exist or can't be read
    // This is expected for projects without nested prompts
  }
}
