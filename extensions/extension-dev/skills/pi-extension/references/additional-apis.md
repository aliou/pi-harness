# Additional APIs

These APIs are available on `ExtensionAPI` and `ExtensionContext` but are less commonly used. Each is shown with a minimal example.

When you implement something using one of these APIs, update this skill reference with a fuller example based on your actual usage.

## Shortcuts

Register global keyboard shortcuts:

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    planModeEnabled = !planModeEnabled;
    ctx.ui.setStatus("plan", planModeEnabled ? "Plan Mode" : "");
  },
});
```

Shortcuts work only in Interactive mode.

## Flags

Register boolean flags that persist across sessions:

```typescript
// Register
pi.registerFlag("auto-commit", {
  description: "Auto-commit after each turn",
  default: false,
});

// Read (in any handler)
const autoCommit = pi.getFlag("auto-commit");
```

Users toggle flags with `/flag auto-commit` in the input editor.

## sendUserMessage

Inject a user message into the conversation programmatically:

```typescript
pi.sendUserMessage("Please summarize what we just discussed");
```

This triggers a full agent turn as if the user typed the message. Useful for file watchers, timers, or other automated triggers.

## Session Name

Set or get a name for the current session (shown in the session selector):

```typescript
pi.setSessionName("Feature: Auth Refactor");
const name = pi.getSessionName();
```

## Labels

Set a label on a specific session entry (shown in `/tree` view):

```typescript
pi.setLabel(entryId, "checkpoint: before refactor");
```

## exec

Run a shell command and get the result:

```typescript
const result = await pi.exec("git status --porcelain", { cwd: ctx.cwd });
// result: { stdout, stderr, exitCode }
```

Useful in hooks for git operations, environment checks, etc.

## Active Tools

Get or set which tools are currently active:

```typescript
const tools = pi.getActiveTools(); // string[]
pi.setActiveTools(["bash", "read", "write", "my_custom_tool"]);
```

Setting active tools restricts which tools the LLM can use.

## Model Control

```typescript
// Set the active model
pi.setModel("anthropic/claude-sonnet-4-20250514");

// Get/set thinking level
const level = pi.getThinkingLevel(); // "none" | "low" | "medium" | "high"
pi.setThinkingLevel("high");
```

## System Prompt

Read or modify the system prompt (typically in `before_agent_start`):

```typescript
pi.on("before_agent_start", async (_event, ctx) => {
  const prompt = ctx.getSystemPrompt();
  ctx.setSystemPrompt(prompt + "\n\nExtra instructions.");
});
```

The system prompt resets each turn, so modifications are not cumulative.

## Compaction

Trigger compaction programmatically:

```typescript
await pi.compact();
```

## Shutdown

Shut down pi gracefully:

```typescript
pi.shutdown();
```

## EventBus

Inter-extension communication via a shared event bus:

```typescript
// Extension A: emit
pi.events.emit("my-extension:data-ready", { items: [...] });

// Extension B: listen
pi.events.on("my-extension:data-ready", (data) => {
  console.log("Received:", data.items.length, "items");
});
```

Namespace event names with your extension name to avoid collisions. The event bus is supplementary -- most extensions do not need it. Use it when two extensions need to coordinate.

## Theme Control

```typescript
// Get current and available themes
const current = ctx.ui.getTheme();
const all = ctx.ui.getAllThemes();

// Set theme
const result = ctx.ui.setTheme("catppuccin-mocha");
// result: { success: boolean, error?: string }
```

## UI Customization

```typescript
// Replace the footer
ctx.ui.setFooter((maxWidth, theme) => {
  return theme.fg("muted", "Custom footer content");
});

// Replace the startup header
ctx.ui.setHeader((maxWidth, theme) => {
  return theme.fg("accent", "My Custom Header");
});

// Set the editor component
ctx.ui.setEditorComponent((tui, theme, kb) => {
  return new CustomEditor(tui, theme, kb);
});

// Prefill the editor
ctx.ui.setEditorText("Prefilled content");
```
