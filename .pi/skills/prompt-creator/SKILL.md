---
name: prompt-creator
description: Create custom prompts for Pi. Use when asked to create a new prompt, extract workflow patterns into prompts, or learn about prompt authoring.
---

# Prompt Creator

Guide for creating custom prompts for Pi. Prompts are reusable instructions that capture common workflows and patterns.

## Prompt Anatomy

Prompts are Markdown files in directory structures:

```
prompts/
├── scope-name/
│   ├── prompt-name.md
│   └── another-prompt.md
└── other-scope/
    └── prompt.md
```

**Locations:**
- Project: `.pi/prompts/*.md` (recursive)
- Global: `~/.local/share/agents/prompts/*.md` (recursive, symlinked from project)

**Invocation:** `/prompt-name (project:scope-name)` or `/scope-name:prompt-name`

### Prompt File Structure

```markdown
---
description: Brief description shown in autocomplete
---

# Prompt Title

Instructions for the agent...
```

**Frontmatter:**
- `description`: Brief overview shown in autocomplete (required)
- Filename (without `.md`) becomes the command name
- Directory name becomes the scope/namespace

## When to Create Prompts

Create prompts for:
- Repeatable workflows you've done in sessions
- Domain-specific patterns you want to capture
- Step-by-step processes that work well
- Common tasks with specific requirements

**Prompts vs Skills:**
- **Prompts**: Workflow instructions, no code execution
- **Skills**: Can include scripts, references, more complex structure

## Creation Workflow

### Step 1: Identify Pattern

From a session or repeated work, identify:
- What scope/category does this belong to?
- What's the command name?
- What steps are taken?
- What decisions are made?
- What's the expected output?

### Step 2: Create Scope Directory

```bash
mkdir -p prompts/scope-name
```

Common scopes: `nix`, `git`, `debug`, `docs`, `test`

### Step 3: Write Prompt File

Create `prompts/scope-name/prompt-name.md`:

```markdown
---
description: Brief description shown in autocomplete
---

# Prompt Title

Brief introduction

## Workflow

1. **Step 1** - What to do
   - Details
   - Expected output

2. **Step 2** - Next action
   - Details
   - Expected output

## Patterns

Common patterns or variations

## Example

Concrete example showing the workflow
```

### Step 4: Symlink to Global Location

```bash
# From project root
ln -s $(pwd)/prompts/scope-name ~/.local/share/agents/prompts/scope-name
```

This makes all prompts in that scope available globally across all projects.

### Step 5: Test

Invoke with `/prompt-name (project:scope-name)` or `/scope-name:prompt-name`:
- Instructions are clear
- Workflow produces expected results

## Design Guidelines

### Be Concise
Prompts should be focused. If it's getting long, consider:
- Breaking into multiple prompts
- Moving details to examples/
- Creating a skill instead

### Show, Don't Just Tell
Include concrete examples:
```markdown
## Example Structure

\`\`\`language
example code or structure
\`\`\`
```

### Specify Patterns
For different project types or scenarios, provide specific guidance:
```markdown
## Project Type Patterns

### Node.js
- Dependencies: nodejs, npm/yarn/pnpm
- Common tools: typescript, eslint

### Rust
- Dependencies: cargo, rustc, rust-analyzer
- Platform libs: pkg-config
```

## Arguments in Prompts

Prompts can accept arguments:

```markdown
---
description: Create a component
---
Create a React component named $1 with features: $@
```

Usage: `/component Button "onClick handler" "disabled support"`
- `$1` = first argument (`Button`)
- `$@` or `$ARGUMENTS` = all arguments joined
- `${@:N}` = arguments from Nth position onwards (1-indexed)
- `${@:N:L}` = L arguments starting from Nth position

## Directory Structure

```
prompts/
├── nix/
│   ├── create-shell.md          # /create-shell (project:nix)
│   └── update-deps.md           # /update-deps (project:nix)
├── git/
│   ├── review-changes.md        # /review-changes (project:git)
│   └── write-commit.md          # /write-commit (project:git)
└── docs/
    └── generate-readme.md       # /generate-readme (project:docs)
```

## Symlinking Reference

Symlink scope directories (not individual files):

```bash
# From project root
ln -s $(pwd)/prompts/nix ~/.pi/agent/prompts/nix
ln -s $(pwd)/prompts/git ~/.pi/agent/prompts/git
```

**Verify symlinks:**
```bash
ls -la ~/.local/share/agents/prompts/
```

## Common Patterns

### Workflow Extraction
When extracting from sessions:
1. Read session JSONL file
2. Identify key tool calls and decisions
3. Extract the pattern, not the specifics
4. Generalize for different project types

### Multi-Stage Workflows
For complex processes:
```markdown
## Workflow

### Stage 1: Analysis
1. Examine X
2. Identify Y

### Stage 2: Planning
1. Determine approach
2. Choose tools

### Stage 3: Execution
1. Implement
2. Verify
```

### Conditional Logic
For workflows with variations:
```markdown
## Workflow

1. **Check condition**
   - If X: do A
   - If Y: do B
   - Otherwise: do C
```

## Quick Reference

```bash
# Create new prompt scope
mkdir -p prompts/scope-name

# Create prompt file
cat > prompts/scope-name/prompt-name.md << 'EOF'
---
description: What this prompt does
---

# Prompt Name

Instructions...
EOF

# Symlink scope to global location
ln -s $(pwd)/prompts/scope-name ~/.local/share/agents/prompts/scope-name

# Verify
ls -la ~/.local/share/agents/prompts/ | grep scope-name
```

## Example: Complete Prompt Creation

```bash
# 1. Create scope directory
mkdir -p prompts/test

# 2. Write prompt file
cat > prompts/test/debug-failure.md << 'EOF'
---
description: Debug failing tests systematically
---

# Debug Test Failure

Systematic approach to debugging test failures.

## Workflow

1. **Run test** - Get full output
2. **Analyze failure** - Identify root cause
3. **Check changes** - What changed recently?
4. **Fix** - Implement solution
5. **Verify** - Run test again

## Common Causes

- Environment differences
- Timing issues
- State pollution
- Missing dependencies
EOF

# 3. Symlink scope directory
ln -s $(pwd)/prompts/test ~/.local/share/agents/prompts/test

# 4. Use it
# /debug-failure (project:test)
# or /test:debug-failure
```
