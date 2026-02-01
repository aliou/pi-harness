/**
 * Frontmatter parsing and manipulation
 */

import { parse, stringify } from "yaml";

/**
 * Parse YAML frontmatter from markdown content
 * Returns empty object if no frontmatter found
 */
export function parseFrontmatter(
  content: string,
): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) {
    return null;
  }

  const yamlContent = match[1];
  const parsed = parse(yamlContent);

  // Return null if parsing didn't produce an object
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

/**
 * Convert frontmatter object to YAML string
 */
export function stringifyFrontmatter(data: Record<string, unknown>): string {
  const yamlContent = stringify(data);
  return `---\n${yamlContent}---`;
}

/**
 * Update a single field in frontmatter
 */
export function updateFrontmatterField(
  content: string,
  field: string,
  value: unknown,
): string {
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    // No frontmatter, create new one
    const newFrontmatter = stringifyFrontmatter({ [field]: value });
    return `${newFrontmatter}\n\n${content}`;
  }

  // Update the field
  frontmatter[field] = value;
  const newFrontmatter = stringifyFrontmatter(frontmatter);

  // Replace old frontmatter
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, newFrontmatter);
}
