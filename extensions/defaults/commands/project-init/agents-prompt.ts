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
  scoutAnalysis: string | undefined,
): string {
  const parts: string[] = [];

  parts.push(
    "Please analyze this codebase and create or update an AGENTS.md file containing:",
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
    "The file will be given to agentic coding tools that operate in this repository. Keep it concise (~20 lines).",
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

  if (scoutAnalysis) {
    parts.push("");
    parts.push("## Scout Analysis");
    parts.push("");
    parts.push(scoutAnalysis);
  }

  parts.push("");
  parts.push(
    "Use the scout tool if you need to research anything about the project's dependencies or best practices.",
  );

  return parts.join("\n");
}
