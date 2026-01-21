#!/usr/bin/env bun

/**
 * Initialize a new Pi skill from template.
 * No external dependencies.
 */

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

function normalizeName(name: string): string {
  // Replace underscores, spaces, and camelCase boundaries with hyphens
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");
}

function validateName(name: string): { valid: boolean; error: string } {
  if (name.length > 64) {
    return {
      valid: false,
      error: `Name too long: ${name.length} chars (max 64)`,
    };
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return {
      valid: false,
      error: "Name must be hyphen-case: lowercase letters, numbers, hyphens",
    };
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return { valid: false, error: "Name cannot start or end with hyphen" };
  }
  if (name.includes("--")) {
    return { valid: false, error: "Name cannot contain consecutive hyphens" };
  }
  return { valid: true, error: "" };
}

function createSkillMd(name: string): string {
  const title = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return `---
name: ${name}
description: TODO: Describe when to use this skill. Be specific about triggering conditions.
---

# ${title}

TODO: Add instructions for the agent.

## When to Use

- TODO: List specific scenarios

## Workflow

1. **Step 1** - Description
   - Output: Expected result

2. **Step 2** - Description
   - Output: Expected result

## Examples

### Example 1: TODO

Input: ...
Output: ...

## Guidelines

- TODO: Add guidelines
`;
}

function createExampleScript(): string {
  return `#!/usr/bin/env bun
/**
 * Example script for the skill.
 */

import { parseArgs } from "util";

function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log("Usage: example.ts <input> [--verbose]");
    process.exit(positionals.length === 0 ? 1 : 0);
  }

  // TODO: Implement script logic
  console.log(\`Processing: \${positionals[0]}\`);
}

main();
`;
}

function createExampleReference(): string {
  return `# Reference Title

Detailed documentation that supplements the main SKILL.md.

## Section 1

Details that are too verbose for the main skill file but useful when needed.

## Section 2

Additional context, edge cases, or advanced usage patterns.
`;
}

function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      path: { type: "string" },
      resources: { type: "string" },
      examples: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0 || !values.path) {
    console.log(`Usage: init_skill.ts <name> --path <output-dir> [options]

Initialize a new Pi skill from template.

Arguments:
  name              Skill name (will be normalized to hyphen-case)

Options:
  --path <dir>      Output directory for the skill (required)
  --resources <list> Comma-separated: scripts,references,assets
  --examples        Create example files in resource directories
  -h, --help        Show this help

Examples:
  init_skill.ts my-skill --path skills/
  init_skill.ts "My Skill" --path .pi/skills/ --resources scripts,references
  init_skill.ts data-processor --path skills/ --resources scripts --examples`);
    process.exit(positionals.length === 0 || !values.path ? 1 : 0);
  }

  // Normalize and validate name
  const name = normalizeName(positionals[0]);
  const { valid, error } = validateName(name);
  if (!valid) {
    console.error(`Error: ${error}`);
    console.error(`  Normalized name: ${name}`);
    process.exit(1);
  }

  // Create skill directory
  const skillDir = join(values.path, name);
  if (existsSync(skillDir)) {
    console.error(`Error: Directory already exists: ${skillDir}`);
    process.exit(1);
  }

  mkdirSync(skillDir, { recursive: true });
  console.log(`Created: ${skillDir}/`);

  // Create SKILL.md
  const skillMdPath = join(skillDir, "SKILL.md");
  writeFileSync(skillMdPath, createSkillMd(name));
  console.log(`Created: ${skillMdPath}`);

  // Parse resources
  const validResources = new Set(["scripts", "references", "assets"]);
  let resources: string[] = [];
  if (values.resources) {
    resources = values.resources.split(",").map((r) => r.trim());
    const invalid = resources.filter((r) => !validResources.has(r));
    if (invalid.length > 0) {
      console.warn(`Warning: Unknown resources ignored: ${invalid.join(", ")}`);
    }
    resources = resources.filter((r) => validResources.has(r));
  }

  // Create resource directories
  for (const resource of resources) {
    const resourceDir = join(skillDir, resource);
    mkdirSync(resourceDir);
    console.log(`Created: ${resourceDir}/`);

    if (values.examples) {
      if (resource === "scripts") {
        const examplePath = join(resourceDir, "example.ts");
        writeFileSync(examplePath, createExampleScript());
        chmodSync(examplePath, 0o755);
        console.log(`Created: ${examplePath}`);
      } else if (resource === "references") {
        const examplePath = join(resourceDir, "example.md");
        writeFileSync(examplePath, createExampleReference());
        console.log(`Created: ${examplePath}`);
      } else if (resource === "assets") {
        const gitkeepPath = join(resourceDir, ".gitkeep");
        writeFileSync(gitkeepPath, "");
        console.log(`Created: ${gitkeepPath}`);
      }
    }
  }

  console.log();
  console.log("Next steps:");
  console.log(`  1. Edit ${skillMdPath} - update description and instructions`);
  if (resources.includes("scripts")) {
    console.log(`  2. Add scripts to ${skillDir}/scripts/`);
  }
  if (resources.includes("references")) {
    console.log(`  3. Add references to ${skillDir}/references/`);
  }
  console.log(`  4. Validate: bun scripts/quick_validate.ts ${skillDir}`);
}

main();
