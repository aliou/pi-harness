# Scripts

## check-public-deps.mjs

Validates that public packages do not depend on private workspace packages.

### Problem

In a monorepo, some packages are published to npm (public) while others remain internal (private). If a public package imports a private package, it will fail when users try to install it from npm because the private dependency won't be available.

### Solution

This script:
1. Scans all workspace packages in `extensions/`, `packages/`, and `themes/`
2. Identifies public packages (those without `"private": true` or with `"publishConfig": { "access": "public" }`)
3. Checks all workspace dependencies (including devDependencies and peerDependencies)
4. Reports any public packages that depend on private workspace packages

### Usage

```bash
# Run manually
pnpm run check:public-deps

# Or directly
node scripts/check-public-deps.mjs
```

### Integration

This check runs automatically:
- **Pre-commit**: Blocks commits that introduce invalid dependencies
- **CI**: Runs on all PRs and pushes to prevent invalid dependencies from being merged

### Fixing Issues

If you encounter an error like:
```
ERROR: Found public packages depending on private packages:

  @aliou/pi-utils-settings
    depends on: @aliou/pi-agent-kit (private)
```

You have three options:

1. **Make the dependency public** (if it should be published):
   - Remove `"private": true` from its package.json
   - Add `"publishConfig": { "access": "public" }`

2. **Make the dependent package private** (if it shouldn't be published):
   - Add `"private": true` to its package.json

3. **Remove the dependency** (if it's not needed):
   - Remove it from package.json dependencies
