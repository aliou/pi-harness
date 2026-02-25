# Pi Extensions

Custom extensions for [Pi](https://github.com/mariozechner/pi-coding-agent), a coding agent.

> [!WARNING]
> Feel free to use these, but they're mainly for my personal use and I might not read/merge your pr. Also, I haven't read a single line of code so I can't be held responsible if something bad happens. Godspeed ✌️

## Installation

Install all extensions from this repository:

```bash
pi install git:github.com/aliou/pi-extensions
```

To install selectively (or disable specific extensions), edit your `settings.json`:

```json
{
  "packages": [
    {
      "source": "git:github.com/aliou/pi-extensions",
      "extensions": [
        "extensions/defaults/index.ts",
        "extensions/providers/index.ts",
        "!extensions/the-dumb-zone/index.ts"
      ]
    }
  ]
}
```

## Published Extensions

Standalone extensions published to npm, each in their own repo.

| Extension | Description | Repo | npm |
|-----------|-------------|------|-----|
| extension-dev | Tools and commands for developing and updating Pi extensions | [repo](https://github.com/aliou/pi-extension-dev) | [@aliou/pi-extension-dev](https://www.npmjs.com/package/@aliou/pi-extension-dev) |
| guardrails | Security hooks to prevent potentially dangerous operations | [repo](https://github.com/aliou/pi-guardrails) | [@aliou/pi-guardrails](https://www.npmjs.com/package/@aliou/pi-guardrails) |
| processes | Background process management without blocking the conversation | [repo](https://github.com/aliou/pi-processes) | [@aliou/pi-processes](https://www.npmjs.com/package/@aliou/pi-processes) |
| toolchain | Opinionated toolchain enforcement | [repo](https://github.com/aliou/pi-toolchain) | [@aliou/pi-toolchain](https://www.npmjs.com/package/@aliou/pi-toolchain) |

## All Extensions

| Extension | Description | README |
|-----------|-------------|--------|
| breadcrumbs | Session history tools (search, extract info, handoff) | [README](extensions/breadcrumbs/README.md) |
| defaults | Sensible defaults and quality-of-life improvements | [README](extensions/defaults/README.md) |
| introspection | Inspect Pi agent internals: system prompt, tools, skills, and context usage | [README](extensions/introspection/README.md) |
| neovim | Bidirectional Neovim integration (editor context, file reload, LSP diagnostics) | [README](extensions/neovim/README.md) |
| planning | Save and execute implementation plans | [README](extensions/planning/README.md) |
| providers | Providers and usage dashboard (rate limits, session stats) | [README](extensions/providers/README.md) |
| subagents | Framework for spawning specialized subagents (scout, oracle, reviewer, etc.) | [README](extensions/subagents/README.md) |
| the-dumb-zone | Context window degradation warning | [README](extensions/the-dumb-zone/README.md) |

## Themes

| Theme | README |
|-------|--------|
| jellybeans | [README](themes/jellybeans/README.md) |

## Development

Uses pnpm workspaces. Nix dev environment available via `flake.nix`.

```sh
nix develop
pnpm install
pnpm typecheck
pnpm lint
```

Or as one-liners:

```sh
nix develop -c pnpm install
nix develop -c pnpm typecheck
nix develop -c pnpm lint
```

### Workspace dependencies

Extensions and packages that depend on other workspace packages must use `workspace:^` in their `package.json`. This tells pnpm to resolve the dependency from the local workspace instead of the npm registry.

```json
{
  "dependencies": {
    "@aliou/pi-utils-settings": "workspace:^"
  }
}
```

The root `package.json` keeps real version ranges (e.g., `^0.2.0`) because pi installs this repository via npm, which does not understand the `workspace:` protocol. A postinstall script (`scripts/resolve-workspace-deps.mjs`) symlinks unpublished workspace packages into `node_modules` for that case.

### Pre-commit hooks

The Nix dev shell installs pre-commit hooks automatically. These run on every commit:

- **biome check** - Linting and formatting for `.ts` and `.json` files.
- **treefmt** - Formatting via treefmt.
- **lockfile check** - Verifies `pnpm-lock.yaml` is up to date (runs when any `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml` changes).
- **typecheck** - Runs `pnpm typecheck` when `.ts` files change.
