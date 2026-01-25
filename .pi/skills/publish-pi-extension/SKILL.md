---
name: publish-pi-extension
description: Publish a pi-extensions repo extension to npm. Use when preparing per-extension package.json files, changesets, and CI-based publishing.
---

# Publish Pi Extension to npm

Publish a single extension from this repo as `@aliou/pi-<name>` using the changesets workflow and direct publish on `main`.

## Preconditions
- The extension has its own `package.json` in `extensions/<name>/`.
- Root changesets config exists at `.changeset/config.json`.
- GitHub Actions publish workflow exists (uses `changesets/action@v1`).
- `NPM_TOKEN` secret is configured in GitHub with publish rights for `@aliou`.

## Package.json requirements (extensions/<name>/package.json)
- `name`: `@aliou/pi-<name>`
- `version`: semantic version
- `type`: `module`
- `publishConfig.access`: `public`
- `keywords`: include `pi-package`
- `pi` field with entry points, for example:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

## Vendoring @aliou/tui-utils (if the extension uses it)
Do not publish `@aliou/tui-utils`. Vendor it into the final published output during build so the published package has no runtime import of `@aliou/tui-utils`. Use a build script (TypeScript is fine) that copies `packages/tui-utils/index.ts` into the extension `dist/vendor/tui-utils/` and rewrites imports to relative paths.

## Create a changeset
1. Run `pnpm changeset`.
2. Select the package to version and choose the bump type.
3. Write a short summary.
4. Commit the changeset and related code changes.

## Publish flow (direct on main)
1. Push to `main`.
2. CI runs `pnpm changeset version` and `pnpm changeset publish`.
3. Tags are created as `pi-<name>@x.y.z`.
4. GitHub release is created for each tag.

## Local validation
- `pnpm changeset version` to verify version bumps.
- `npm pack` inside `extensions/<name>/` to verify tarball contents and the `pi` manifest paths.
