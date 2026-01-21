# Output Patterns

Design patterns for consistent skill outputs.

## Template Pattern

Provide exact structure for outputs:

```markdown
## Output Format

Generate output with this exact structure:

### Title
[One line title]

### Summary
[2-3 sentence overview]

### Details
- **Item 1**: Description
- **Item 2**: Description

### Next Steps
1. First action
2. Second action
```

## Flexible Template

Provide structure with optional sections:

```markdown
## Output Format

### Required Sections
- **Overview**: Always include
- **Key Findings**: Always include

### Optional Sections (include if relevant)
- **Warnings**: If issues found
- **Alternatives**: If multiple approaches exist
- **References**: If external resources helpful
```

## Example-Based Pattern

Show desired output through examples:

```markdown
## Output Examples

### Example 1: Simple case
Input: "Create a user model"
Output:
```typescript
interface User {
  id: string;
  name: string;
  email: string;
}
```

### Example 2: Complex case
Input: "Create a user model with roles and timestamps"
Output:
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  updatedAt: Date;
}
```
```

## Structured Data Pattern

For machine-readable outputs:

```markdown
## Output Format

Return JSON with this schema:

```json
{
  "status": "success" | "error",
  "result": {
    "field1": "string",
    "field2": number,
    "items": ["array", "of", "strings"]
  },
  "metadata": {
    "duration": "time taken",
    "source": "data source"
  }
}
```
```

## Progressive Disclosure Pattern

Layer information from summary to detail:

```markdown
## Output Structure

1. **One-liner**: Single sentence result
2. **Summary**: 2-3 paragraph overview
3. **Details**: Full breakdown (only if requested or complex)

Default to summary level. Provide details when:
- User explicitly asks
- Result is complex or unexpected
- Multiple options exist
```

## Diff/Change Pattern

For modification outputs:

```markdown
## Output Format

Show changes as:

### Changes Made
- `file.ts`: Added validation function
- `config.json`: Updated timeout value

### Before/After (for significant changes)
Before:
```
old code
```

After:
```
new code
```
```

## Status Pattern

For progress or status reports:

```markdown
## Status Format

### Overall: [PASS/FAIL/PARTIAL]

| Check | Status | Notes |
|-------|--------|-------|
| Check 1 | PASS | |
| Check 2 | FAIL | Reason |
| Check 3 | SKIP | Not applicable |

### Summary
X of Y checks passed.
```

## Error Pattern

For error reporting:

```markdown
## Error Format

### Error: [Brief description]

**What happened**: Description of the issue

**Why**: Root cause if known

**How to fix**:
1. First step
2. Second step

**Workaround** (if fix not possible):
Alternative approach
```
