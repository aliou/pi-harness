/**
 * Frontmatter parsing and manipulation
 */

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

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  // Simple YAML parser for our needs (key: value, arrays, quoted strings)
  const lines = yaml.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentArray: unknown[] = [];

  for (const line of lines) {
    // Array item
    if (line.match(/^\s*-\s+(.+)$/)) {
      const value = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim() ?? "";
      currentArray.push(value);
      continue;
    }

    // If we were building an array, save it
    if (currentKey && currentArray.length > 0) {
      result[currentKey] = currentArray;
      currentKey = null;
      currentArray = [];
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1] ?? "";
      const value = kvMatch[2]?.trim() ?? "";

      if (value === "") {
        // Empty value, might be starting an array
        currentKey = key;
        currentArray = [];
      } else if (value === "[]") {
        // Empty array
        result[key] = [];
      } else {
        // Regular value
        result[key] = value;
      }
    }
  }

  // Save any remaining array
  if (currentKey && currentArray.length > 0) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Convert frontmatter object to YAML string
 */
export function stringifyFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return `---\n${lines.join("\n")}\n---`;
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
