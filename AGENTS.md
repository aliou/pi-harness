# Pi Extensions

This repository hosts custom extensions for [Pi](https://github.com/mariozechner/pi-coding-agent), a coding agent.

All packages in this repository are published under the `@aliou` scope, not `@anthropic` or `@anthropic-ai`.

## Structure

- `extensions/` - Custom Pi extensions
- `integrations/` - Editor and browser integrations (neovim, chrome)
- `packages/` - Shared packages (e.g., tsconfig, agent-kit)
- `scripts/` - Build and CI scripts
- `archive/` - Lightweight gist-based extensions tracked as submodules

## Extensions

- `breadcrumbs` - Session history tools. Search past sessions, extract information, hand off context to new sessions.
- `defaults` - Personal sensible defaults and quality-of-life improvements (directory-aware read, flexible edit parameters, AGENTS.md discovery, git rebase helper, notifications, terminal title, auto session naming).
- `introspection` - Inspect Pi agent internals: system prompt, tools, skills, context usage.
- `modes` - Hardcoded execution modes with tool gating, model defaults, and branch-aware restore.
- `planning` - Turn conversations into implementation plans and manage saved plans.
- `providers` - Register custom providers and show unified rate-limit and usage dashboards.
- `subagents` - Framework for spawning specialized subagents with custom tools, consistent UI rendering, and logging.
- `the-dumb-zone` - Detects when an AI session is degrading and shows a warning overlay.

## Integrations

- `neovim` - Bidirectional integration between Pi and Neovim.

## Development

Uses pnpm workspaces. Nix environment available via `flake.nix`.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm run check:public-deps
```

### Public vs Private Packages

This monorepo contains both published (public) and internal (private) packages:

- **Public packages**: Published to npm, installable by users
  - Must have `"private": false` or `"publishConfig": { "access": "public" }"`
  - Cannot depend on private workspace packages
  - Examples: `@aliou/pi-utils-settings`, `@aliou/pi-utils-ui`

- **Private packages**: Internal only, not published
  - Have `"private": true` in package.json
  - Can depend on anything
  - Examples: Extensions, `@aliou/pi-agent-kit`

**Important**: Public packages cannot depend on private workspace packages. This is enforced by:
- Pre-commit hook that blocks invalid commits
- CI check that prevents merging invalid dependencies

Run `pnpm run check:public-deps` to validate dependencies. See `scripts/README.md` for details.
