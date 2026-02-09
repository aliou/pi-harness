export interface Skill {
  name: string;
  description: string;
}

const SKILLS_BLOCK_RE =
  /The following skills[\s\S]*?<available_skills>[\s\S]*?<\/available_skills>/;
const SKILL_RE =
  /<skill>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>[\s\S]*?<\/location>\s*<\/skill>/g;

export function parseSkills(prompt: string): {
  textWithoutSkills: string;
  skills: Skill[];
} {
  const blockMatch = prompt.match(SKILLS_BLOCK_RE);
  if (!blockMatch) {
    return { textWithoutSkills: prompt, skills: [] };
  }

  const textWithoutSkills = prompt.replace(SKILLS_BLOCK_RE, "").trimEnd();

  const skills: Skill[] = [];
  const xmlContent = blockMatch[0];
  for (const m of xmlContent.matchAll(SKILL_RE)) {
    skills.push({
      name: (m[1] ?? "").trim(),
      description: (m[2] ?? "").trim(),
    });
  }

  return { textWithoutSkills, skills };
}
