# Messages

Pi provides several ways to display information to the user. Choose based on the UX goal.

## When to Use What

| Method | Persistence | Interactivity | Use When |
|---|---|---|---|
| `ctx.ui.notify()` | Transient (fades) | None | Quick feedback: "Saved", "API key missing" |
| `ctx.ui.custom()` | Until dismissed | Full keyboard | Rich interactive display: pickers, dashboards |
| `pi.sendMessage()` | In session history | Via renderer | Persistent results that should survive compaction |
| `pi.appendEntry()` | In session history | Via renderer | State tracking entries (see `references/state.md`) |

## sendMessage

Sends a message into the session conversation. It appears as an assistant message and is persisted in session history.

```typescript
pi.sendMessage({
  customType: "balance-result",     // Identifier for the message renderer
  content: "Balance: $42.50",       // Plain text content (LLM sees this)
  display: true,                    // Show in TUI
  details: { balance: 42.50 },     // Rich data for custom rendering
});
```

| Field | Type | Description |
|---|---|---|
| `customType` | `string` | Identifies the message type. Paired with `registerMessageRenderer`. |
| `content` | `string` | Plain text content. This is what the LLM sees if the message is in context. |
| `display` | `boolean` | Whether to show the message in the TUI. |
| `details` | `object` | Arbitrary data passed to the message renderer. |

## registerMessageRenderer

Registers a custom renderer for messages with a specific `customType`:

```typescript
pi.registerMessageRenderer("balance-result", (message, theme) => {
  const { balance } = message.details;
  return [
    theme.bold("Account Balance"),
    "",
    theme.fg("success", `  $${balance.toFixed(2)}`),
  ].join("\n");
});
```

The renderer receives the full message object and the theme. It returns a string for display in the TUI.

If no renderer is registered for a `customType`, the message's `content` field is displayed as plain text.

## Pattern: Command with sendMessage Fallback

This combines with the three-tier pattern from `references/modes.md`. Use `sendMessage` as the RPC fallback for commands that use `custom()`:

```typescript
// Register the renderer once at load time
pi.registerMessageRenderer("my-results", (message, theme) => {
  const { items } = message.details;
  return [
    theme.bold(`Results (${items.length})`),
    ...items.map((item: string) => `  ${theme.fg("accent", item)}`),
  ].join("\n");
});

pi.registerCommand("results", {
  description: "Show results",
  handler: async (_args, ctx) => {
    const items = await fetchItems();

    if (!ctx.hasUI) {
      console.log(items.join("\n"));
      return;
    }

    const result = await ctx.ui.custom<void>((tui, theme, _kb, done) => {
      return new ResultsDisplay(theme, items, () => done(undefined));
    });

    if (result === undefined) {
      pi.sendMessage({
        customType: "my-results",
        content: items.join("\n"),
        display: true,
        details: { items },
      });
    }
  },
});
```

## notify

For transient feedback that does not need to persist:

```typescript
ctx.ui.notify("Operation complete", "info");
ctx.ui.notify("Something went wrong", "error");
ctx.ui.notify("Proceed with caution", "warning");
```

The second argument is the notification type: `"info"`, `"error"`, or `"warning"`. It affects the color/icon.

`notify` is fire-and-forget. It works in Interactive and RPC modes, and is a no-op in Print mode.
