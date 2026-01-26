import { loadSkills, type Skill } from "@mariozechner/pi-coding-agent";

export interface ResolveSkillsResult {
  /** Successfully resolved skills */
  skills: Skill[];
  /** Skill names that were not found */
  notFound: string[];
}

/**
 * Resolve skill names to Skill objects.
 *
 * Discovers skills from the given cwd using the Pi SDK and filters
 * by exact name match. No glob patterns supported.
 *
 * @param skillNames - Array of skill names to resolve
 * @param cwd - Working directory for skill discovery
 * @returns Object with resolved skills and list of not-found names
 */
export function resolveSkillsByName(
  skillNames: string[],
  cwd: string,
): ResolveSkillsResult {
  // Discover all available skills from standard locations
  const { skills: allSkills } = loadSkills({ cwd });

  const found: Skill[] = [];
  const notFound: string[] = [];

  for (const name of skillNames) {
    const skill = allSkills.find((s) => s.name === name);
    if (skill) {
      found.push(skill);
    } else {
      notFound.push(name);
    }
  }

  return { skills: found, notFound };
}
