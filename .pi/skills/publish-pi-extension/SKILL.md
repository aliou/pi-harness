---
name: publish-pi-extension
description: Publish a pi-extensions repo extension to npm. Use when preparing per-extension package.json files, changesets, and CI-based publishing.
---

# Publish Pi Extension to npm

Publish a single extension from this repo as `@aliou/pi-<name>` using the changesets workflow and direct publish on `main`.

## Preconditions
- The extension has its own `package.json` in `extensions/<name>/`.
- Root changesets config exists at `.changeset/config.json`.
- GitHub Actions publish workflow exists (uses `changesets/action@v1` with OIDC).
- npm trusted publisher configured for the package (repo: `aliou/pi-extensions`, workflow: `publish.yml`).

## Documentation requirements

Before publishing, ensure:

1. **Extension README.md** exists with:
   - Description of what the extension does
   - Installation instructions (both git and npm)
   - Features list (tools, commands, hooks)
   - Usage examples
   - Requirements section (if external dependencies exist)

2. **Root README.md** includes the extension:
   - Listed under the appropriate section (UX, Safety, Context Engineering, Monitoring, Tools, Introspection)
   - Format: `### [name](extensions/name/)` header, short description, `[npm](url)` link
   - Add the npm link after publishing: `[npm](https://www.npmjs.com/package/@aliou/pi-<name>)`

## Package.json requirements (extensions/<name>/package.json)
- `name`: `@aliou/pi-<name>`
- `version`: start at `0.0.1` (first minor changeset publishes as 0.1.0)
- `type`: `module`
- `private`: `false`
- `publishConfig.access`: `public`
- `keywords`: include `pi-package`
- `repository`: required for npm provenance

```json
{
  "name": "@aliou/pi-<name>",
  "version": "0.0.1",
  "type": "module",
  "private": false,
  "keywords": ["pi-package", "pi-extension", "pi", "<name>"],
  "repository": {
    "type": "git",
    "url": "https://github.com/aliou/pi-extensions"
  },
  "pi": {
    "extensions": ["./index.ts"]
  },
  "publishConfig": {
    "access": "public"
  },
  "files": ["*.ts", "<subdirs>", "README.md"],
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": ">=0.49.0",
    "@mariozechner/pi-tui": ">=0.49.0"
  }
}
```

## Vendoring @aliou/tui-utils (if the extension uses it)
Do not publish `@aliou/tui-utils`. Vendor it into the final published output during build so the published package has no runtime import of `@aliou/tui-utils`. Use a build script (TypeScript is fine) that copies `packages/tui-utils/index.ts` into the extension `dist/vendor/tui-utils/` and rewrites imports to relative paths.

## Create a changeset
1. Run `pnpm changeset`.
2. Select the package to version and choose the bump type:
   - First publish: use `minor` (0.0.1 → 0.1.0)
   - Bug fixes: use `patch`
   - New features: use `minor`
   - Breaking changes: use `major`
3. Write a short summary.
4. Commit the changeset and related code changes.

## Publish flow (direct on main)
1. Push to `main`.
2. CI runs `pnpm changeset version` and `pnpm changeset publish`.
3. Tags are created as `pi-<name>@x.y.z`.
4. GitHub release is created for each tag.

## First-time npm trusted publisher setup
For new packages, npm trusted publishers require the package to exist first:
1. Create a minimal placeholder package locally:
   ```bash
   mkdir /tmp/pi-<name>-init && cd /tmp/pi-<name>-init
   echo '{"name":"@aliou/pi-<name>","version":"0.0.0","publishConfig":{"access":"public"}}' > package.json
   npm publish --access public --otp=<code>
   ```
2. Configure trusted publisher on npmjs.com:
   - Go to package settings → Trusted Publisher
   - Add GitHub Actions: `aliou/pi-extensions`, workflow `publish.yml`
3. Now CI can publish subsequent versions via OIDC.

## Local validation
- `pnpm changeset version` to verify version bumps.
- `npm pack` inside `extensions/<name>/` to verify tarball contents and the `pi` manifest paths.
