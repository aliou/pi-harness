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
        "extensions/processes/index.ts",
        "extensions/defaults/index.ts",
        "!extensions/the-dumb-zone/index.ts"
      ]
    }
  ]
}
```

Some extensions are published individually to npm:

```bash
pi install npm:@aliou/pi-processes
```

## Themes

### [jellybeans](themes/jellybeans/)

Jellybeans mono theme variants.

## UX

Extensions that improve the interaction experience.

### [defaults](extensions/defaults/)

Sensible defaults and quality-of-life improvements. Directory-aware read (returns listing instead of failing), auto theme sync with macOS appearance.

### [neovim](extensions/neovim/)

Bidirectional Neovim integration. Injects visible splits into context, reloads files after edits, sends LSP diagnostics. Includes a Neovim plugin for the editor side.

### [processes](extensions/processes/)

Background process management. Start long-running commands (dev servers, build watchers) without blocking the conversation. File-based logging, friendly names, auto-cleanup.

[npm](https://www.npmjs.com/package/@aliou/pi-processes)

### [presenter](extensions/presenter/)

Terminal presentation layer. Updates terminal title, sends system notifications (iTerm2, Kitty, Ghostty), plays sound alerts on macOS.

## Safety

Extensions that prevent mistakes.

### [guardrails](extensions/guardrails/)

Security hooks. Blocks Homebrew commands (project uses Nix), protects `.env` files, prompts for confirmation on dangerous commands.

[npm](https://www.npmjs.com/package/@aliou/pi-guardrails)

## Context Engineering

Extensions that improve agent reasoning and planning.

### [specialized-subagents](extensions/specialized-subagents/)

Framework for spawning specialized subagents with custom tools. Includes scout (web research), oracle (GPT-5 advisor), reviewer (code review), lookout (semantic search), and more.

### [planning](extensions/planning/)

Save and execute implementation plans. `/plan:save` creates a structured plan from the current conversation, `/plan:execute` runs a saved plan.

### [session-management](extensions/session-management/)

Session management utilities. Copy session path to clipboard. Future: summarization of previous sessions, cross-session context.

## Providers

Extensions that register custom model providers.

### [apple-fm](extensions/apple-fm/)

Apple Foundation Model provider. Wraps Apple's on-device ~3B model via a bundled Swift CLI bridge. Free, offline, private. Best for lightweight tasks (title generation, summarization) -- 4,096 token context window.

Requires macOS 26+ and Apple Silicon.

## Monitoring

Extensions that track session health and API usage.

### [providers](extensions/providers/)

Providers and usage dashboard. Registers OpenRouter Gemini/Moonshot models, shows rate limits with pace markers, and exposes the `/usage` dashboard.

### [the-dumb-zone](extensions/the-dumb-zone/)

Context window degradation warning. Monitors token usage relative to the model's context window and shows a warning overlay when quality may be degrading.

## Tools

Extensions that provide custom tools for external automation.

### [mac-app](extensions/mac-app/)

macOS UI automation via Accessibility. Query UI elements, click, type, scroll, run actions. Requires AXorcist CLI and Accessibility permissions.

## Introspection

Extensions that help understand Pi itself.

### [meta](extensions/meta/)

Pi introspection tools. Query current version, read documentation, view changelog.

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
