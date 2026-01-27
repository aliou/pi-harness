# Publishing to npm

Publish a single extension from this repo as `@aliou/pi-<name>` using changesets and CI.

## Preconditions

- Extension has its own `package.json` in `extensions/<name>/`
- Root changesets config exists at `.changeset/config.json`
- GitHub Actions publish workflow exists (uses `changesets/action@v1` with OIDC)
- npm trusted publisher configured for the package

## Pre-publish Checklist

1. **Extension README.md** exists with installation, features, usage
2. **Root README.md** includes the extension under the appropriate section
3. Add npm link after publishing: `[npm](https://www.npmjs.com/package/@aliou/pi-<name>)`

## Package.json Template

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

## Vendoring @aliou/tui-utils

If the extension uses `@aliou/tui-utils`, vendor it into the published output. Do not publish with a runtime import of `@aliou/tui-utils`. Use a build script that copies `packages/tui-utils/index.ts` into `dist/vendor/tui-utils/` and rewrites imports.

## Create a Changeset

1. Run `pnpm changeset`
2. Select the package and bump type:
   - First publish: `minor` (0.0.1 -> 0.1.0)
   - Bug fixes: `patch`
   - New features: `minor`
   - Breaking changes: `major`
3. Write a short summary
4. Commit the changeset with code changes

## Publish Flow

1. Push to `main`
2. CI runs `pnpm changeset version` and `pnpm changeset publish`
3. Tags created as `pi-<name>@x.y.z`
4. GitHub release created for each tag

## First-time npm Trusted Publisher Setup

For new packages:

1. Create placeholder package locally:
   ```bash
   mkdir /tmp/pi-<name>-init && cd /tmp/pi-<name>-init
   echo '{"name":"@aliou/pi-<name>","version":"0.0.0","publishConfig":{"access":"public"}}' > package.json
   npm publish --access public --otp=<code>
   ```

2. Configure on npmjs.com:
   - Package settings -> Trusted Publisher
   - Add GitHub Actions: `aliou/pi-extensions`, workflow `publish.yml`

3. CI can now publish via OIDC

## Local Validation

```bash
# Verify version bumps
pnpm changeset version

# Verify tarball contents
cd extensions/<name>
npm pack
```
