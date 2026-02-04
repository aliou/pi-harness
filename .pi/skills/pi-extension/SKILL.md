---
name: pi-extension
description: Create, update, and publish Pi extensions. Use when working on extensions in this repository.
---

# Pi Extension Development

Guide for creating and maintaining Pi extensions. Read the relevant reference files before implementing.

## Key Imports

```typescript
// Core types
import type { ExtensionAPI, ExtensionContext, ToolDefinition, ProviderDefinition } from "@mariozechner/pi-coding-agent";

// Schema (TypeBox)
import { Type } from "@mariozechner/pi-coding-agent";

// TUI components
import type { Component, Theme } from "@mariozechner/pi-tui";
import { Text, Box, Container, SelectList } from "@mariozechner/pi-tui";

// Utilities
import { truncateHead, highlightCode, getLanguageFromPath, DynamicBorder, BorderedLoader } from "@mariozechner/pi-coding-agent";
```

## Workflow

### Creating a New Extension

1. Read `references/structure.md` for the project layout and package.json template.
2. Create the entry point (`src/index.ts`) with a default export function.
3. Decide what the extension provides:
   - **Tools** (LLM-callable): Read `references/tools.md`.
   - **Commands** (user-invoked): Read `references/commands.md`.
   - **Providers** (LLM backends): Read `references/providers.md`.
   - **Hooks** (event handlers): Read `references/hooks.md`. Includes both `tool_call` blocking hooks and spawn hooks for transparent command rewriting via `createBashTool`.
4. Read `references/modes.md` for mode-awareness guidelines. Every extension must handle Interactive, RPC, and Print modes.
5. If the extension displays rich UI: Read `references/components.md` for TUI components and `references/messages.md` for message display patterns.
6. If the extension tracks state: Read `references/state.md`.
7. For less common APIs: Read `references/additional-apis.md`.
8. Before publishing: Read `references/publish.md` and `references/documentation.md`.

### Modifying an Existing Extension

1. Read the extension's `index.ts` to understand its structure.
2. Read the relevant reference file for the area you are modifying.
3. Check `references/modes.md` if adding any UI interaction.
4. Run type checking after changes.

## Reference Files

| File | Content |
|---|---|
| `references/structure.md` | Project layout, package.json, tsconfig, entry point, API key pattern, imports |
| `references/tools.md` | Tool registration, execute signature, parameters, streaming, rendering, naming |
| `references/hooks.md` | Events, blocking/cancelling, input transformation, system prompt modification, bash spawn hooks (command rewriting) |
| `references/commands.md` | Command registration, three-tier pattern, component extraction |
| `references/components.md` | TUI components (pi-tui + pi-coding-agent), custom(), theme styling, keyboard handling |
| `references/providers.md` | Provider registration, model definition, compat field, API key gating |
| `references/modes.md` | Mode behavior matrix, ctx.hasUI, dialog vs fire-and-forget, three-tier pattern |
| `references/messages.md` | sendMessage, registerMessageRenderer, notify, when to use each |
| `references/state.md` | appendEntry, state reconstruction, appendEntry vs sendMessage |
| `references/additional-apis.md` | Shortcuts, flags, exec, sendUserMessage, session name, labels, model control, EventBus, theme, UI customization |
| `references/publish.md` | npm publishing, changesets, versioning, pre-publish checklist |
| `references/testing.md` | Local development, type checking, manual testing, debugging |
| `references/documentation.md` | README template, what to document, changelog |

## Reference Extensions

When implementing, look at these existing extensions for patterns:

**Standalone repos (recommended structure):**
- `pi-linkup` (`/Users/alioudiallo/code/src/github.com/aliou/pi-linkup/`): Tools wrapping a third-party API. Has tools, a command, custom message rendering, API key gating.
- `pi-synthetic` (`/Users/alioudiallo/code/src/github.com/aliou/pi-synthetic/`): Provider + tools. Has a provider with models, a command with `custom()` component, API key gating, async entry point.

**Monorepo extensions (simpler structure):**
- `extensions/defaults/` in this repo: Simple tool registration (get_current_time).
- `extensions/guardrails/` in this repo: Event hooks (tool_call blocking). Has `hooks/`, `commands/`, `components/`, `utils/` directories with config types in `config.ts`.
- `extensions/toolchain/` in this repo: Bash spawn hooks (command rewriting via `createBashTool`) combined with tool_call blockers. Has `blockers/`, `rewriters/`, `commands/`, `utils/` directories.
- `extensions/processes/` in this repo: Multi-action tool with StringEnum parameters.

## Critical Rules

1. **Execute parameter order**: `(toolCallId, params, signal, onUpdate, ctx)`. Signal before onUpdate.
2. **Always use `onUpdate?.()`**: Optional chaining. The parameter can be `undefined`.
3. **No `.js` in imports**: Use bare module paths (`./tools/my-tool`, not `./tools/my-tool.js`).
4. **Mode awareness**: Every `ctx.ui.custom()` call needs an RPC fallback (use `select`/`confirm`/`notify` -- they work in RPC). Every `tool_call` hook with dialogs needs a `ctx.hasUI` check.
5. **API key gating**: Check before registering tools that require the key. Providers handle missing keys internally via their `models()` function.
6. **Tool naming**: Prefix with API name for third-party integrations (`linkup_web_search`). No prefix for internal tools (`get_current_time`).
7. **peerDependencies**: Use `>=CURRENT_VERSION` range, not `*`.
8. **Check existing components**: Before creating a new TUI component, check if `pi-tui` or `pi-coding-agent` already exports one that fits.
9. **Never use `homedir()` for pi paths**: Use the SDK helpers from `@mariozechner/pi-coding-agent` instead. They respect the `PI_CODING_AGENT_DIR` env var which is used for testing and custom setups. Key functions: `getAgentDir()`, `getSettingsPath()`, `getSessionsDir()`, `getPromptsDir()`, `getToolsDir()`, `getCustomThemesDir()`, `getModelsPath()`, `getAuthPath()`, `getBinDir()`, `getDebugLogPath()`. All exported from the main package entry point.

## Checklist

Before considering an extension complete:

- [ ] Entry point has correct default export signature.
- [ ] All tools have correct execute parameter order.
- [ ] All `onUpdate` calls use optional chaining.
- [ ] No `.js` file extensions in imports.
- [ ] `ctx.ui.custom()` calls have RPC fallback (undefined check).
- [ ] `tool_call` hooks check `ctx.hasUI` before dialog methods.
- [ ] Fire-and-forget methods (notify, setStatus, etc.) are used without hasUI guards.
- [ ] Missing API keys produce a notification, not a crash.
- [ ] `pnpm typecheck` passes.
- [ ] No `homedir()` calls for pi paths -- uses SDK helpers (`getAgentDir()`, etc.).
- [ ] README documents tools, commands, env vars.
