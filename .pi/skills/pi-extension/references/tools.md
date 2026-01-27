# Writing Tools

## Basic Tool

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

## Return Values

The `execute` function returns:
- `content`: Array of content blocks for the LLM (text, images, etc.)
- `details`: Optional typed object for rich TUI rendering

```typescript
return {
  content: [{ type: "text", text: "Result text for LLM" }],
  details: { success: true, data: someData },
};
```

## Rendering

- `renderCall`: Shows tool invocation in TUI (e.g., `tool_name param1`)
- `renderResult`: Shows result in TUI (success/error messages, tables, etc.)

Both receive the theme for consistent styling. Use `theme.fg("color", text)` for coloring.
