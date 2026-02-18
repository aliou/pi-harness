import { describe, expect, it } from "vitest";
import { parseSkills } from "./parse-skills";

const skillsBlock = (skills: string) =>
  `The following skills provide specialized instructions for specific tasks.\n<available_skills>\n${skills}</available_skills>`;

const skill = (
  name: string,
  description: string,
  location = "/path/to/skill",
) =>
  `  <skill>\n    <name>${name}</name>\n    <description>${description}</description>\n    <location>${location}</location>\n  </skill>\n`;

describe("parseSkills", () => {
  it("returns original text and empty skills array when no skills block present", () => {
    const prompt = "You are a helpful assistant.";
    const result = parseSkills(prompt);
    expect(result.textWithoutSkills).toBe(prompt);
    expect(result.skills).toEqual([]);
  });

  it("extracts a single skill and removes the block from text", () => {
    const block = skillsBlock(skill("my-skill", "Does things"));
    const prompt = `Preamble.\n${block}`;
    const result = parseSkills(prompt);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toEqual({
      name: "my-skill",
      description: "Does things",
    });
    expect(result.textWithoutSkills).not.toContain("<available_skills>");
    expect(result.textWithoutSkills).toContain("Preamble.");
  });

  it("parses multiple skills correctly", () => {
    const block = skillsBlock(
      skill("skill-one", "First skill") + skill("skill-two", "Second skill"),
    );
    const result = parseSkills(block);
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0]).toEqual({
      name: "skill-one",
      description: "First skill",
    });
    expect(result.skills[1]).toEqual({
      name: "skill-two",
      description: "Second skill",
    });
  });

  it("trims whitespace from name and description", () => {
    const block = skillsBlock(
      `  <skill>\n    <name>  padded-skill  </name>\n    <description>  Padded desc  </description>\n    <location>/p</location>\n  </skill>\n`,
    );
    const result = parseSkills(block);
    expect(result.skills[0]).toEqual({
      name: "padded-skill",
      description: "Padded desc",
    });
  });

  it("preserves surrounding text when skills block is in the middle", () => {
    const before = "Line before.";
    const after = "Line after.";
    const block = skillsBlock(skill("s", "desc"));
    const prompt = `${before}\n${block}\n${after}`;
    const result = parseSkills(prompt);
    expect(result.textWithoutSkills).toContain(before);
    expect(result.textWithoutSkills).toContain(after);
    expect(result.textWithoutSkills).not.toContain("<available_skills>");
  });
});
