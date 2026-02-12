# Publishing

Extensions are published to npm and installed with `pi install`.

## Package Setup

The `package.json` must have the `pi` key declaring extension resources. See `references/structure.md` for the full template.

Key fields for publishing:

```json
{
  "name": "@scope/pi-my-extension",
  "version": "0.1.0",
  "description": "Clear description of what the extension does",
  "license": "MIT",
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": ">=0.51.0"
  }
}
```

## Versioning with Changesets

Use [changesets](https://github.com/changesets/changesets) for versioning and changelogs.

### Setup

```bash
pnpm add -D @changesets/cli
pnpm changeset init
```

### Workflow

1. Make changes to the extension.
2. Create a changeset:
   ```bash
   pnpm changeset
   ```
   Select the package, choose the bump type (patch/minor/major), and write a summary.
3. Commit the changeset file along with your changes.
4. When ready to release:
   ```bash
   pnpm changeset version   # Updates version and CHANGELOG.md
   pnpm publish             # Publishes to npm
   ```

### .changeset/config.json

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

## Installation

Users install extensions with:

```bash
pi install @scope/pi-my-extension
```

Pi reads the `pi` key from the package's `package.json` to discover extensions, skills, themes, and prompts.

## Dependency Management in Monorepos

If publishing from a monorepo that contains both public and private packages:

**Critical rule**: Public packages cannot depend on private workspace packages. This will break when users try to install your package from npm.

In the pi-extensions monorepo, this is enforced by:
- Pre-commit hook that blocks commits with invalid dependencies
- CI check that prevents merging bad dependencies
- `pnpm run check:public-deps` validates all dependencies

When adding a workspace dependency to a package.json:
1. Check if the dependency is public (look for `"private": false` or `"publishConfig": { "access": "public" }`)
2. If the dependency is private, either:
   - Make it public (if it should be published)
   - Make your package private (if it shouldn't be published)
   - Don't add the dependency

## Pre-publish Checklist

- [ ] `peerDependencies` version range is correct (>= minimum supported version).
- [ ] `description` is clear and concise.
- [ ] `pi.extensions` paths are correct.
- [ ] If in a monorepo: package doesn't depend on private workspace packages (`pnpm run check:public-deps` if available).
- [ ] README documents what the extension does, required environment variables, and available tools/commands.
- [ ] If wrapping a third-party API: extension handles missing API key gracefully (notification, not crash).
- [ ] Extension works in all modes (Interactive, RPC, Print) or degrades gracefully.
- [ ] `pnpm typecheck` passes.
