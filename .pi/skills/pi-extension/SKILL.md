---
name: pi-extension
description: Create, update, and publish Pi extensions. Use when working on extensions in this repository.
---

# Pi Extension

Manage Pi extensions in the `extensions/` directory of this monorepo.

**Important**: All packages in this repository are published under the `@aliou` scope, not `@anthropic` or `@anthropic-ai`.

## Workflow

1. **Creating a new extension**: Read `refs/structure.md` first, then the relevant component refs
2. **Adding/modifying tools**: Read `refs/tools.md`
3. **Adding hooks**: Read `refs/hooks.md`
4. **Adding interactive commands**: Read `refs/commands.md`
5. **Adding reusable TUI components**: Read `refs/components.md`
6. **Writing documentation**: Read `refs/documentation.md`
7. **Publishing to npm**: Read `refs/publish.md`

## Key Imports

```typescript
// Types and API
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  AgentToolResult,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";

// TUI components
import { Text, Component, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

// Schema definition
import { Type, Static } from "@sinclair/typebox";

// For multi-action tools
import { StringEnum } from "@mariozechner/pi-ai";
```

## Reference Extensions

- [extensions/meta/](../../../extensions/meta/) - Simple extension with multiple tools
- [extensions/processes/](../../../extensions/processes/) - Complex extension with tools, hooks, commands, and state management
- [extensions/presenter/](../../../extensions/presenter/) - Notification presentation (OSC, sounds)

## Checklist

- [ ] Create directory structure (`refs/structure.md`)
- [ ] Implement tools (`refs/tools.md`)
- [ ] Add hooks if needed (`refs/hooks.md`)
- [ ] Add commands if needed (`refs/commands.md`)
- [ ] Write extension README (`refs/documentation.md`)
- [ ] Update root README (`refs/documentation.md`)
- [ ] Run `pnpm typecheck`
- [ ] Create package.json if publishing (`refs/publish.md`)
