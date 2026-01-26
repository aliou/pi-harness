# Extension Structure

## Directory Layout

```
extensions/<name>/
├── index.ts           # Entry point - exports default function(pi: ExtensionAPI)
├── README.md          # Documentation
├── tools/
│   ├── index.ts       # Hub: exports setup function
│   └── <tool>.ts      # Individual tool definitions
├── components/        # Optional: reusable TUI components (used by tools/commands)
│   ├── index.ts       # Optional: barrel exports
│   └── <component>.ts # TUI Component implementation
├── hooks/             # Optional
│   ├── index.ts       # Hub: exports setup function
│   └── <hook>.ts      # Individual hooks
├── commands/          # Optional
│   ├── index.ts       # Hub: exports register function
│   └── <command>.ts   # Individual command definitions
├── constants/         # Optional: shared types and constants
│   ├── index.ts       # Barrel exports
│   └── types.ts       # Type definitions and constants
├── utils/             # Optional: shared utilities
│   ├── index.ts       # Barrel exports
│   └── <util>.ts      # Utility functions
└── manager.ts         # Optional: state management class
```

## Entry Point

```typescript
// extensions/<name>/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupXxxTools } from "./tools";
import { setupXxxHooks } from "./hooks";      // if hooks exist
import { registerCommands } from "./commands"; // if commands exist

export default function (pi: ExtensionAPI) {
  // If tools share state, create manager and pass to all
  const manager = new SomeManager(); // optional

  setupXxxTools(pi, manager);
  registerCommands(pi, manager);   // optional
  setupXxxHooks(pi, manager);      // optional
}
```

## Tool Hub

```typescript
// extensions/<name>/tools/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupFooTool } from "./foo-tool";
import { setupBarTool } from "./bar-tool";

export function setupXxxTools(pi: ExtensionAPI) {
  setupFooTool(pi);
  setupBarTool(pi);
}
```

## Command Hub

```typescript
// extensions/<name>/commands/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFooCommand } from "./foo";
import { registerBarCommand } from "./bar";

export function registerCommands(pi: ExtensionAPI) {
  registerFooCommand(pi);
  registerBarCommand(pi);
}
```

## Workflow

1. Create directory: `extensions/<name>/`
2. Create `index.ts` entry point
3. Create `tools/index.ts` hub
4. Create individual tool files in `tools/`
5. Add hooks in `hooks/` if needed
6. Add commands in `commands/` if needed
7. Create `README.md`
8. Update root `README.md`
9. Run `pnpm typecheck`
