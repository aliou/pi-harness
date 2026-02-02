# Pi Extension Dev

Tools and commands for developing and updating Pi extensions.

## Installation

```bash
pi install npm:@aliou/pi-extension-dev
```

Or from git:

```bash
pi install git:github.com/aliou/pi-extensions --extension extensions/extension-dev/index.ts
```

## Tools

### `detect_package_manager`

Detects the package manager used in the current project. Checks the `packageManager` field in `package.json` first, then falls back to lockfile detection (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`). Walks up from the working directory to the git root.

Returns the package manager name, version (if declared), lockfile path, and install/run commands.

### `pi_version`

Returns the version of the currently running Pi instance.

### `pi_docs`

Lists all Pi documentation files from the Pi installation: `README.md`, individual files in `docs/`, and the `examples/` directory path.

### `pi_changelog`

Parses the Pi changelog and returns entries for a specific version (or the latest). When the requested version is newer than the installed Pi, fetches the changelog from GitHub.

## Commands

### `/extensions:update [VERSION]`

Update Pi extensions to a target version. Without an argument, checks npm for the latest version and lets you choose between latest and installed. With a version argument, targets that version directly.

Runs a guided workflow: detects the package manager, compares versions, reads changelogs and docs, analyzes source files for breaking changes, presents an update plan, and applies changes after confirmation.

## Compatibility

Compatible with Pi 0.50.x and 0.51.0+. Tools that need the extension context use a runtime shim to handle the execute signature difference between versions.
