---
name: skill-creator
description: Create skills for Pi. Use when asked to create a new skill, update an existing skill, or learn about skill authoring best practices.
---

# Skill Creator

Guide for creating effective Pi skills. Skills are markdown-based instructions that extend the agent's capabilities for specific domains or workflows.

## Skill Anatomy

```
skill-name/
├── SKILL.md          # Required - frontmatter + instructions
├── scripts/          # Optional - executable Python/Bash
├── references/       # Optional - detailed docs loaded as needed
└── assets/           # Optional - templates, examples (not auto-loaded)
```

### SKILL.md Structure

```markdown
---
name: skill-name           # Required: hyphen-case, lowercase, max 64 chars
description: When to use   # Required: max 1024 chars, explain triggering conditions
---

# Skill Title

Instructions for the agent...
```

**Frontmatter rules:**
- `name`: hyphen-case only (e.g., `my-skill-name`), max 64 characters
- `description`: explain WHEN to use this skill, max 1024 characters, no HTML brackets

## Context Budget

Skills share context with system prompt, conversation history, and user requests. Be ruthless about brevity.

**Progressive disclosure:**
1. **Metadata** (~100 words) - Always visible, triggers skill activation
2. **SKILL.md body** (<5K words) - Loaded when skill triggers
3. **Bundled resources** - Loaded only when explicitly referenced

**Guidelines:**
- Keep SKILL.md under 500 lines
- Move detailed documentation to `references/`
- Challenge each line: "Does the agent really need this?"
- Prefer examples over explanations

## Degrees of Freedom

Match constraint level to task fragility:

| Level | Format | When to Use |
|-------|--------|-------------|
| High | Text instructions | Multiple valid approaches, creative tasks |
| Medium | Pseudocode/templates | Repeatable patterns with variations |
| Low | Exact scripts | Fragile operations, strict sequences |

## Creation Workflow

### Step 1: Understand with Examples

Gather 3-5 concrete usage examples. For each, identify:
- What triggers the skill?
- What steps does the agent take?
- What resources are needed?

### Step 2: Plan Structure

Analyze examples to identify:
- **Scripts**: Repeated deterministic operations
- **References**: Detailed docs needed occasionally
- **Assets**: Templates, boilerplate for output

### Step 3: Initialize

```bash
bun scripts/init_skill.ts <skill-name> --path <output-dir>
```

Options:
- `--resources scripts,references,assets` - Create resource directories
- `--examples` - Include example files

### Step 4: Implement

1. Write SKILL.md with clear instructions
2. Create scripts for deterministic operations
3. Add references for detailed documentation
4. Include assets for output templates

### Step 5: Validate

```bash
bun scripts/quick_validate.ts <path/to/skill>
```

Checks:
- SKILL.md exists with valid YAML
- Required frontmatter fields present
- Naming conventions followed
- Field length limits respected

### Step 6: Iterate

Test the skill on real tasks, identify gaps, update and revalidate.

## Design Patterns

### Multi-Step Workflows

For sequential processes, use numbered steps with clear completion criteria:

```markdown
## Workflow

1. **Analyze** - Examine input, identify requirements
   - Output: List of requirements
   
2. **Plan** - Design approach based on requirements
   - Output: Implementation plan
   
3. **Execute** - Implement the plan
   - Output: Completed artifact
```

See `references/workflows.md` for advanced patterns.

### Output Formatting

For consistent output, provide templates or examples:

```markdown
## Output Format

Generate a summary with this structure:

### Summary
[One paragraph overview]

### Key Points
- Point 1
- Point 2

### Recommendations
1. First recommendation
2. Second recommendation
```

See `references/output-patterns.md` for more patterns.

## Scripts

Scripts should:
- Be executable (`chmod +x`)
- Include usage help (`--help`)
- Validate inputs before processing
- Print clear success/error messages
- Exit with appropriate codes (0 success, 1 error)

## Common Mistakes

1. **Too verbose** - Agent already knows common patterns
2. **Unclear triggers** - Description doesn't explain when to activate
3. **Missing examples** - Abstract instructions without concrete cases
4. **Context bloat** - Loading everything upfront instead of progressively

## Quick Reference

```bash
# Create new skill
bun scripts/init_skill.ts my-skill --path ~/code/src/github.com/aliou/pi-extensions/skills/ --resources scripts,references

# Validate skill
bun scripts/quick_validate.ts ~/code/src/github.com/aliou/pi-extensions/skills/my-skill

# Symlink to make skill available
ln -s ~/code/src/github.com/aliou/pi-extensions/skills/my-skill ~/.local/share/agents/skills/my-skill
```

## Skill Location

Write skills in `~/code/src/github.com/aliou/pi-extensions/skills/` and symlink them to `~/.local/share/agents/skills/` to make them available globally.
