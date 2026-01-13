# Pi Extensions

Custom extensions for [Pi](https://github.com/mariozechner/pi-coding-agent), a coding agent.

> [!WARNING]
> Feel free to use these, but they're mainly for my personal use and I might not read/merge your pr. Also, I haven't read a single line of code so I can't be held responsible if something bad happens. Godspeed ✌️

## Extensions

| Extension | Description | Requirements |
|-----------|-------------|--------------|
| [debug](extensions/debug/README.md) | Debugging utilities (session path clipboard) | - |
| [meta](extensions/meta/README.md) | Pi introspection tools (version, docs, changelog) | - |
| [neovim](extensions/neovim/README.md) | Bidirectional Neovim integration (editor context, file reload, LSP diagnostics) | - |
| [defaults](extensions/defaults/README.md) | Custom header, auto session naming | - |
| [processes](extensions/processes/README.md) | Background process management | - |
| [specialized-subagents](extensions/specialized-subagents/README.md) | Framework for spawning specialized subagents | [External services](extensions/specialized-subagents/README.md#requirements) |

## Development

Uses pnpm workspaces. Nix environment available via `flake.nix`.

```sh
pnpm install
pnpm typecheck
pnpm lint
```
