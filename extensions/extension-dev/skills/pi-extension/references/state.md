# State Management

Extensions can persist state in the session history using `appendEntry`. State is reconstructed by replaying entries when a session is loaded.

## appendEntry

Adds an entry to the session conversation. Unlike `sendMessage`, entries from `appendEntry` are explicitly for state tracking and are rendered via the tool result rendering system.

```typescript
pi.appendEntry({
  toolName: "todo",
  toolCallId: `todo-${Date.now()}`,
  input: { action: "add", text: "Buy groceries" },
  output: "Added: Buy groceries",
  display: true,
  details: { items: ["Buy groceries"] },
});
```

| Field | Type | Description |
|---|---|---|
| `toolName` | `string` | Which tool this entry is associated with. Used for rendering. |
| `toolCallId` | `string` | Unique ID for this entry. |
| `input` | `object` | The "input" shown in the entry (as if the tool was called with these params). |
| `output` | `string` | The text output (what the LLM sees). |
| `display` | `boolean` | Whether to show in TUI. |
| `details` | `object` | Rich data for the tool's `renderResult`. |

## Reconstructing State from Session

When a session loads, you can reconstruct state by iterating over existing entries. This is typically done in a `session_start` or `session_switch` handler:

```typescript
pi.on("session_start", async (_event, ctx) => {
  // Rebuild state from session entries
  const entries = ctx.getEntries();
  for (const entry of entries) {
    if (entry.toolName === "todo" && entry.details) {
      todoItems = entry.details.items;
    }
  }
});
```

This pattern makes state survive session reloads, forks, and compactions (as long as the entries are included in the compaction summary).

## When to Use appendEntry vs sendMessage

| | `appendEntry` | `sendMessage` |
|---|---|---|
| Rendered as | Tool call/result pair | Assistant message |
| Custom renderer | Tool's `renderResult` | `registerMessageRenderer` |
| Use for | State changes, action logs | Information display, command results |
| LLM sees | The `output` field | The `content` field |

Use `appendEntry` when you are tracking state changes that need to be replayed. Use `sendMessage` when you are displaying a one-time result.
