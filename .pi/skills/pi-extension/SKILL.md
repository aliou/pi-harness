---
name: pi-extension
description: Create, update, and publish Pi extensions. Use when working on extensions in this repository.
---

# Pi Extension

Manage Pi extensions in the `extensions/` directory of this monorepo.

**Important**: All packages in this repository are published under the `@aliou` scope, not `@anthropic` or `@anthropic-ai`.

## Workflow

1. **Creating a new extension**: Read `references/structure.md` first, then the relevant component references
2. **Adding/modifying tools**: Read `references/tools.md`
3. **Adding hooks**: Read `references/hooks.md`
4. **Adding interactive commands**: Read `references/commands.md`
5. **Adding reusable TUI components**: Read `references/components.md`
6. **Writing documentation**: Read `references/documentation.md`
7. **Testing manually**: Read `references/testing.md`
8. **Publishing to npm**: Read `references/publish.md`

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

- [ ] Create directory structure (`references/structure.md`)
- [ ] Implement tools (`references/tools.md`)
- [ ] Add hooks if needed (`references/hooks.md`)
- [ ] Add commands if needed (`references/commands.md`)
- [ ] Write extension README (`references/documentation.md`)
- [ ] Update root README (`references/documentation.md`)
- [ ] Run `pnpm typecheck`
- [ ] Create test scenarios (`references/testing.md`)
- [ ] Create package.json if publishing (`references/publish.md`)
