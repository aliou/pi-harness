import { readFileSync } from "node:fs";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";
import type { SkillInfo } from "./skills";

function formatSkillBlock(skill: SkillInfo): string {
  const body = stripFrontmatter(readFileSync(skill.fullPath, "utf-8")).trim();
  return `<skill name="${skill.name}" location="${skill.fullPath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

export interface SkillExpansionResult {
  prose: string;
  skills: ExpandedSkillInvocation[];
}

export interface ExpandedSkillInvocation {
  name: string;
  path: string;
  description?: string;
  xml: string;
}

/**
 * Expand known inline skill references while retaining their names in prose.
 * A single selected skill is embedded in the user message so pi renders it
 * natively; multiple selected skills are returned for separate skill
 * messages because pi's parser handles one skill block per user message.
 */
export function expandSkillReferences(
  text: string,
  skills: SkillInfo[],
): SkillExpansionResult {
  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
  if (skillsByName.size === 0) return { prose: text, skills: [] };

  const names = [...skillsByName.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const referencePattern = new RegExp(
    `(^|\\s)\\?\\??(${names.join("|")})(?=$|[^A-Za-z0-9_.-])`,
    "g",
  );
  const selected = new Map<string, SkillInfo>();

  const prose = text.replace(
    referencePattern,
    (reference, boundary: string, name: string) => {
      const skill = skillsByName.get(name);
      if (!skill) return reference;
      selected.set(name, skill);
      return `${boundary}${name}`;
    },
  );

  if (selected.size === 0) return { prose: text, skills: [] };

  return {
    prose,
    skills: [...selected.values()].map((skill) => ({
      name: skill.name,
      path: skill.fullPath,
      description: skill.description,
      xml: formatSkillBlock(skill),
    })),
  };
}
