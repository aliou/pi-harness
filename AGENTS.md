# Pi Extensions

This repository hosts custom extensions for [Pi](https://github.com/mariozechner/pi-coding-agent), a coding agent.

All packages in this repository are published under the `@aliou` scope, not `@anthropic` or `@anthropic-ai`.

## Structure

- `extensions/` - Custom Pi extensions
- `packages/` - Shared packages (e.g., tsconfig)

## Development

Uses pnpm workspaces. Nix environment available via `flake.nix`.

```sh
pnpm install
pnpm typecheck
pnpm lint
```
