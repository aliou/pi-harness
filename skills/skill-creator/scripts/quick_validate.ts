#!/usr/bin/env bun

/**
 * Validate a Pi skill structure and content.
 * No external dependencies - uses simple YAML frontmatter parsing.
 */

import { existsSync, statSync } from "fs";
import { basename, join } from "path";
import { parseArgs } from "util";

interface Frontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Simple YAML frontmatter parser for basic key: value pairs.
 * Handles multi-line strings and simple nested objects.
 */
function parseSimpleYaml(text: string): Frontmatter {
  const result: Frontmatter = {};
  const lines = text.split("\n");

  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;

  for (const line of lines) {
    // Check for new key: value pair
    const match = line.match(/^([a-z][a-z0-9-]*)\s*:\s*(.*)$/i);

    if (match && !inMultiline) {
      // Save previous key if exists
      if (currentKey) {
        result[currentKey] = currentValue.trim();
      }

      currentKey = match[1];
      currentValue = match[2];

      // Check for multi-line indicator
      if (currentValue === "|" || currentValue === ">") {
        inMultiline = true;
        currentValue = "";
      }
    } else if (inMultiline) {
      // Continue multi-line value
      if (line.startsWith("  ") || line === "") {
        currentValue += (currentValue ? "\n" : "") + line.replace(/^ {2}/, "");
      } else {
        // End of multi-line
        inMultiline = false;
        result[currentKey] = currentValue.trim();

        // Check if this line starts a new key
        const newMatch = line.match(/^([a-z][a-z0-9-]*)\s*:\s*(.*)$/i);
        if (newMatch) {
          currentKey = newMatch[1];
          currentValue = newMatch[2];
        } else {
          currentKey = "";
          currentValue = "";
        }
      }
    }
  }

  // Save last key
  if (currentKey) {
    result[currentKey] = currentValue.trim();
  }

  return result;
}

function parseFrontmatter(content: string): {
  frontmatter: Frontmatter | null;
  error: string;
} {
  if (!content.startsWith("---")) {
    return {
      frontmatter: null,
      error: "SKILL.md must start with YAML frontmatter (---)",
    };
  }

  const parts = content.split("---", 3);
  if (parts.length < 3) {
    return {
      frontmatter: null,
      error: "Invalid frontmatter: missing closing ---",
    };
  }

  const frontmatterText = parts[1].trim();
  try {
    const frontmatter = parseSimpleYaml(frontmatterText);
    return { frontmatter, error: "" };
  } catch (e) {
    return { frontmatter: null, error: `Invalid YAML in frontmatter: ${e}` };
  }
}

function validateName(name: string | undefined): string[] {
  const errors: string[] = [];

  if (!name) {
    errors.push("Missing 'name' field in frontmatter");
    return errors;
  }

  if (name.length > 64) {
    errors.push(`Name too long: ${name.length} chars (max 64)`);
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    errors.push(
      "Name must be hyphen-case: start with letter, only lowercase, numbers, hyphens",
    );
  }

  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push("Name cannot start or end with hyphen");
  }

  if (name.includes("--")) {
    errors.push("Name cannot contain consecutive hyphens");
  }

  return errors;
}

function validateDescription(description: string | undefined): string[] {
  const errors: string[] = [];

  if (!description) {
    errors.push("Missing 'description' field in frontmatter");
    return errors;
  }

  if (description.length > 1024) {
    errors.push(`Description too long: ${description.length} chars (max 1024)`);
  }

  if (description.includes("<") || description.includes(">")) {
    errors.push("Description cannot contain angle brackets (< or >)");
  }

  if (description.startsWith("TODO")) {
    errors.push("Description still contains TODO placeholder");
  }

  return errors;
}

function validateFrontmatter(frontmatter: Frontmatter): string[] {
  const errors: string[] = [];

  errors.push(...validateName(frontmatter.name));
  errors.push(...validateDescription(frontmatter.description));

  const allowedFields = new Set([
    "name",
    "description",
    "license",
    "allowed-tools",
    "metadata",
  ]);
  const unknownFields = Object.keys(frontmatter).filter(
    (k) => !allowedFields.has(k),
  );

  if (unknownFields.length > 0) {
    errors.push(`Unknown frontmatter fields: ${unknownFields.join(", ")}`);
  }

  return errors;
}

async function validateSkill(skillPath: string): Promise<string[]> {
  const errors: string[] = [];

  if (!existsSync(skillPath)) {
    return [`Skill directory not found: ${skillPath}`];
  }

  const stat = statSync(skillPath);
  if (!stat.isDirectory()) {
    return [`Not a directory: ${skillPath}`];
  }

  const skillMdPath = join(skillPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return [`Missing required file: ${skillMdPath}`];
  }

  const content = await Bun.file(skillMdPath).text();
  const { frontmatter, error: parseError } = parseFrontmatter(content);

  if (parseError) {
    errors.push(parseError);
    return errors;
  }

  if (!frontmatter) {
    errors.push("Empty frontmatter");
    return errors;
  }

  errors.push(...validateFrontmatter(frontmatter));

  // Check directory name matches skill name
  const dirName = basename(skillPath);
  if (frontmatter.name && dirName !== frontmatter.name) {
    errors.push(
      `Directory name '${dirName}' doesn't match skill name '${frontmatter.name}'`,
    );
  }

  // Validate scripts are executable
  const scriptsDir = join(skillPath, "scripts");
  if (existsSync(scriptsDir)) {
    const glob = new Bun.Glob("*.{ts,py,sh}");
    for await (const file of glob.scan(scriptsDir)) {
      const filePath = join(scriptsDir, file);
      const fileStat = statSync(filePath);
      const isExecutable = (fileStat.mode & 0o111) !== 0;
      if (!isExecutable) {
        errors.push(`Script not executable: ${file}`);
      }
    }
  }

  return errors;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      strict: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(`Usage: quick_validate.ts <path-to-skill> [--strict]

Validate a Pi skill structure and content.

Arguments:
  path          Path to skill directory

Options:
  --strict      Treat warnings as errors
  -h, --help    Show this help

Examples:
  quick_validate.ts skills/my-skill
  quick_validate.ts .pi/skills/my-skill --strict`);
    process.exit(positionals.length === 0 ? 1 : 0);
  }

  const skillPath = positionals[0];
  const errors = await validateSkill(skillPath);

  if (errors.length > 0) {
    console.log(`Validation failed for: ${skillPath}`);
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
    process.exit(1);
  } else {
    console.log(`Validation passed: ${skillPath}`);
    process.exit(0);
  }
}

main();
