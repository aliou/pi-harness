# Pi Extensions

This repository hosts custom extensions for [Pi](https://github.com/mariozechner/pi-coding-agent), a coding agent.

All packages in this repository are published under the `@aliou` scope, not `@anthropic` or `@anthropic-ai`.

## Structure

- `extensions/` - Custom Pi extensions
- `packages/` - Shared packages (e.g., tsconfig)

## Extensions

- `breadcrumbs` - Session history tools. Search past sessions, extract information, hand off context to new sessions.
- `defaults` - Sensible defaults and quality-of-life improvements.
- `extension-dev` - Tools and commands for developing and updating Pi extensions.
- `guardrails` - Security hooks to prevent potentially dangerous operations.
- `introspection` - Inspect Pi agent internals: system prompt, tools, skills, context usage.
- `neovim` - Bidirectional integration between Pi and Neovim.
- `planning` - Turn conversations into implementation plans and manage saved plans.
- `presenter` - Terminal-specific presentation for events emitted by other extensions.
- `processes` - Manage background processes. Start long-running commands (dev servers, build watchers, log tailers) without blocking the conversation.
- `providers` - Register custom providers and show unified rate-limit and usage dashboards.
- `subagents` - Framework for spawning specialized subagents with custom tools, consistent UI rendering, and logging.
- `the-dumb-zone` - Detects when an AI session is degrading and shows a warning overlay.
- `toolchain` - Opinionated toolchain enforcement. Transparently rewrites commands to use preferred tools.

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
