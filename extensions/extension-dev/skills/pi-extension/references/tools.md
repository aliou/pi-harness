# Tools

Tools are functions the LLM can call. They are the primary way extensions add capabilities to pi.

## Registration

```typescript
import { Type, type ExtensionAPI, type ToolDefinition } from "@mariozechner/pi-coding-agent";

const myTool: ToolDefinition = {
  name: "my_tool",
  description: "What this tool does. The LLM reads this to decide when to call it.",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    limit: Type.Optional(Type.Number({ description: "Max results", default: 10 })),
  }),
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const results = await doSomething(params.query, params.limit);
    return {
      output: JSON.stringify(results),
      display: true,
      details: { results },
    };
  },
};

export default function (pi: ExtensionAPI) {
  pi.registerTool(myTool);
}
```

## Execute Signature

```typescript
execute(
  toolCallId: string,
  params: Static<TParams>,      // Typed from the parameters schema
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<TDetails>>
```

**Parameter order matters.** The signal comes before onUpdate.

Always use optional chaining when calling `onUpdate`:

```typescript
onUpdate?.({ output: "partial result", details: { progress: 50 } });
```

The `onUpdate` parameter can be `undefined`. Calling it without optional chaining will throw.

## Tool Overrides and Delegation

If you override a built-in tool or wrap another tool, audit any delegated `tool.execute(...)` calls during upgrades. These forwarders often pass through `signal`, `onUpdate`, or `ctx` and can silently break when the execute signature changes. Always recheck the delegate call parameter order and include optional parameters that the target tool expects.

## Return Value

```typescript
return {
  output: string,          // Text sent to the LLM
  display?: boolean,       // Whether to show in the TUI (default: false)
  isError?: boolean,       // Report as error to the LLM (default: false)
  details?: TDetails,      // Arbitrary data available in the renderer
};
```

- `output` is what the LLM sees. Keep it structured and concise.
- `details` is what the renderer sees. Put rich data here for custom display.
- Set `isError: true` to tell the LLM the tool call failed.

## Parameters Schema

Use TypeBox (`Type.*`) for parameter schemas. The LLM sees the schema to know what arguments to provide.

```typescript
import { Type } from "@mariozechner/pi-coding-agent";

// Required string
Type.String({ description: "File path to read" })

// Optional with default
Type.Optional(Type.Number({ description: "Max results", default: 10 }))

// Enum (string union)
Type.StringEnum(["created", "updated", "relevance"], { description: "Sort order" })

// Boolean
Type.Boolean({ description: "Include hidden files" })

// Nested object
Type.Object({
  name: Type.String(),
  value: Type.String(),
})

// Array
Type.Array(Type.String(), { description: "List of tags" })
```

Always provide `description` on parameters. The LLM uses these to understand what to pass.

## Streaming Updates

Use `onUpdate` to stream partial results while the tool executes. This gives the user feedback during long operations.

```typescript
execute: async (toolCallId, params, signal, onUpdate, ctx) => {
  for (const chunk of chunks) {
    const partial = processChunk(chunk);
    onUpdate?.({
      output: partial,
      details: { progress: chunk.index / chunks.length },
    });
  }
  return { output: finalResult, display: true, details: { complete: true } };
},
```

## Custom Rendering

Override how a tool's invocation and result appear in the TUI.

```typescript
const myTool: ToolDefinition = {
  name: "my_tool",
  // ... parameters, execute ...

  renderCall(params, theme) {
    return theme.fg("toolTitle", `Searching for: ${params.query}`);
  },

  renderResult(result, { expanded, isPartial }, theme) {
    if (isPartial) {
      return theme.fg("muted", "Searching...");
    }
    const data = result.details;
    return [
      theme.fg("success", `Found ${data.results.length} results`),
      ...data.results.map((r: string) => `  ${r}`),
    ].join("\n");
  },
};
```

`renderCall` receives the params the LLM passed and returns a string shown when the tool is invoked.

`renderResult` receives the result (with `details`) and rendering options:
- `expanded`: Whether the entry is expanded in the TUI.
- `isPartial`: Whether this is a streaming update (from `onUpdate`) or the final result.

Both return a string or undefined (falls back to default rendering).

## Naming Conventions

For extensions wrapping a third-party API, prefix tool names with the API name to avoid conflicts:

```
linkup_web_search
linkup_web_fetch
synthetic_web_search
```

For internal/custom tools, no prefix is needed:

```
get_current_time
processes
```

Use snake_case for all tool names.

## Abort Signal

The `signal` parameter lets you cancel long-running operations when the user interrupts.

```typescript
execute: async (toolCallId, params, signal, onUpdate, ctx) => {
  const response = await fetch(url, { signal });
  // If the user cancels, fetch throws an AbortError
  return { output: await response.text() };
},
```

Pass `signal` to any async operation that supports it (fetch, child processes, etc.).

## Output Truncation

For tools that may return large outputs, use the `truncateHead` utility:

```typescript
import { truncateHead } from "@mariozechner/pi-coding-agent";

execute: async (toolCallId, params, signal, onUpdate, ctx) => {
  const fullOutput = await getLargeOutput();
  return {
    output: truncateHead(fullOutput, 50000), // Keep last 50KB
    display: true,
  };
},
```

`truncateHead` keeps the tail of the output (most recent content), which is usually most relevant.
