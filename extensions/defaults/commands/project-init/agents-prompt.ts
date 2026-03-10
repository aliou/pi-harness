/**
 * AGENTS.md generation prompt builder.
 *
 * Builds a prompt injected via pi.sendUserMessage() that instructs the
 * agent to analyze the project and generate/update AGENTS.md.
 */

import type { CatalogEntry } from "./catalog";
import type { ProjectStack } from "./scanner";

export function buildAgentsPrompt(
  stack: ProjectStack,
  selectedEntries: CatalogEntry[],
  targetDirs: string[],
  promptOverride?: string | null,
): string {
  const parts: string[] = [];

  parts.push(
    "Please analyze this codebase and create or update AGENTS.md files containing:",
  );
  parts.push(
    "1. Build/lint/test commands - especially for running a single test",
  );
  parts.push("2. Architecture and codebase structure information");
  parts.push(
    "3. Code style guidelines (imports, conventions, formatting, types, naming, error handling)",
  );
  parts.push("");
  parts.push(
    "The files will be given to agentic coding tools that operate in this repository. Keep each file concise (~20 lines).",
  );
  parts.push("");
  parts.push(
    "**Skip dependency and build directories** (node_modules/, vendor/, dist/). Read manifest files to understand dependencies.",
  );
  parts.push("");
  parts.push(
    "If there are existing rule files (AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules, .clinerules, .goosehints, .github/copilot-instructions.md), incorporate their content.",
  );
  parts.push("");

  // Target directories
  if (targetDirs.length > 0) {
    parts.push("## Target Directories");
    parts.push("");
    parts.push(
      "Create or update AGENTS.md in each of these directories. Tailor the content to the specific subproject if it differs from the root:",
    );
    for (const dir of targetDirs) {
      parts.push(`- ${dir}`);
    }
    parts.push("");
  }

  // Project context
  parts.push("## Project Context");
  parts.push("");
  parts.push(`Detected stack: ${stack.summary}`);

  if (selectedEntries.length > 0) {
    parts.push("");
    parts.push("Installed skills/packages:");
    for (const entry of selectedEntries) {
      parts.push(`- ${entry.name} (${entry.type}): ${entry.description}`);
    }
  }

  if (promptOverride && promptOverride.trim().length > 0) {
    parts.push("");
    parts.push("## Extra instructions from user");
    parts.push("");
    parts.push(promptOverride.trim());
  }

  parts.push("");
  parts.push(
    "Use scout only for deep dependency/best-practice research that needs multi-source synthesis. For quick checks, prefer direct commands/tools.",
  );

  return parts.join("\n");
}
