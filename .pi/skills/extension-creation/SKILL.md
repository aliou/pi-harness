---
name: extension-creation
description: Create Pi extensions in this repository. Use when asked to create a new extension, add tools, hooks, or commands to Pi.
---

# Extension Creation

Create Pi extensions in the `extensions/` directory of this monorepo.

## Structure

```
extensions/<name>/
├── index.ts           # Entry point - exports default function(pi: ExtensionAPI)
├── README.md          # Documentation
├── tools/
│   ├── index.ts       # Hub: exports setup function
│   └── <tool>.ts      # Individual tool definitions
├── hooks/             # Optional
│   ├── index.ts       # Hub: exports setup function
│   └── <hook>.ts      # Individual hooks
├── commands/          # Optional
│   └── index.ts       # Interactive TUI commands
├── constants.ts       # Optional: shared constants
├── manager.ts         # Optional: state management class
└── utils.ts           # Optional: shared utilities
```

## Documentation

- Add a **Requirements** section in the extension README when tools depend on external binaries, permissions, system services, or environment setup.
- Update the root `README.md` extensions table to reflect those requirements.

## Entry Point

```typescript
// extensions/<name>/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupXxxTools } from "./tools";
import { setupXxxHooks } from "./hooks";      // if hooks exist
import { setupXxxCommands } from "./commands"; // if commands exist

export default function (pi: ExtensionAPI) {
  // If tools share state, create manager and pass to all
  const manager = new SomeManager(); // optional

  setupXxxTools(pi, manager);
  setupXxxCommands(pi, manager);   // optional
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

## Individual Tool

```typescript
// extensions/<name>/tools/foo-tool.ts
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

// Parameters schema using TypeBox
const FooParams = Type.Object({
  param1: Type.String({ description: "Parameter description" }),
  param2: Type.Optional(Type.Number({ description: "Optional param" })),
});
type FooParamsType = Static<typeof FooParams>;

// Typed details for rich rendering
interface FooDetails {
  success: boolean;
  message: string;
  // ... other result fields
}

type ExecuteResult = AgentToolResult<FooDetails>;

export function setupFooTool(pi: ExtensionAPI) {
  pi.registerTool<typeof FooParams, FooDetails>({
    name: "tool_name",
    label: "Tool Label",
    description: "Description for the LLM - be specific about when to use",
    parameters: FooParams,

    async execute(
      _toolCallId: string,
      params: FooParamsType,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
      _signal?: AbortSignal,
    ): Promise<ExecuteResult> {
      // Implementation
      return {
        content: [{ type: "text", text: "result for LLM" }],
        details: { success: true, message: "Result for rendering" },
      };
    },

    renderCall(args: FooParamsType, theme: Theme): Text {
      let text = theme.fg("toolTitle", theme.bold("tool_name"));
      if (args.param1) {
        text += ` ${theme.fg("accent", args.param1)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<FooDetails>,
      _options: ToolRenderResultOptions,
      theme: Theme,
    ): Text {
      const { details } = result;
      if (!details) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" && text.text ? text.text : "No result",
          0,
          0,
        );
      }
      if (!details.success) {
        return new Text(theme.fg("error", details.message), 0, 0);
      }
      return new Text(theme.fg("success", details.message), 0, 0);
    },
  });
}
```

## Multi-Action Tool

For tools with multiple actions (like `processes`), use StringEnum:

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

const MultiParams = Type.Object({
  action: StringEnum(["start", "list", "stop"] as const, {
    description: "Action: start (run), list (show all), stop (terminate)",
  }),
  id: Type.Optional(Type.String({ description: "Required for stop" })),
});
```

## Hook Registration

```typescript
// extensions/<name>/hooks/cleanup.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function setupCleanupHook(pi: ExtensionAPI, manager: Manager) {
  pi.on("session_shutdown", async () => {
    manager.cleanup();
  });
}
```

Available events: check Pi docs for the current event list.

## Command Registration (Interactive TUI)

```typescript
// extensions/<name>/commands/index.ts
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { type Component, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

class MyComponent implements Component {
  constructor(
    private tui: { requestRender: () => void },
    private theme: Theme,
    private onClose: () => void,
  ) {}

  handleInput(data: string): boolean {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return true;
    }
    return true;
  }

  invalidate(): void {}

  render(width: number): string[] {
    return ["Line 1", "Line 2"];
  }
}

export function setupXxxCommands(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    pi.registerCommand("mycommand", {
      description: "Description for /mycommand",
      handler: async (_args, ctx) => {
        await ctx.ui.custom((tui, theme, _keybindings, done) => {
          return new MyComponent(tui, theme, () => done(undefined));
        });
      },
    });
  });
}
```

## README.md Template

```markdown
# Extension Name

Short description.

## Features

- **Tool**: `tool_name` - what it does
- **Command**: `/command` - interactive panel (if applicable)

## Usage

### Tool (for agent)

\`\`\`
tool_name param="value"
\`\`\`

### Command (interactive)

Run `/command` to open panel.

## Future Improvements

- [ ] ...
```

## Workflow

1. Create directory: `extensions/<name>/`
2. Create `index.ts` entry point
3. Create `tools/index.ts` hub
4. Create individual tool files in `tools/`
5. Add hooks in `hooks/` if needed (cleanup, events)
6. Add commands in `commands/` if interactive UI needed
7. Create `README.md`
8. Update root `README.md` to list the new extension and link to its README
9. Run `pnpm typecheck` to verify

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

## References

- [extensions/meta/](../../extensions/meta/) - Simple extension with multiple tools
- [extensions/processes/](../../extensions/processes/) - Complex extension with tools, hooks, commands, and state management
