# Testing

Pi loads extensions directly from TypeScript source (no build step). Testing is done by running pi with the extension loaded.

## Local Development

During development, the extension is loaded from the local filesystem. Point pi to your extension's `package.json` directory:

```bash
# From within the extension directory
pi
```

Pi reads the `pi.extensions` paths from `package.json` and loads the entry points.

## Type Checking

Run TypeScript type checking to catch errors without building:

```bash
pnpm tsc --noEmit
# or if configured in package.json:
pnpm typecheck
```

## Manual Testing Checklist

- [ ] Extension loads without errors.
- [ ] Tools appear in the tool list and work when called by the LLM.
- [ ] Commands appear in autocomplete and work when invoked.
- [ ] Custom renderers display correctly (both partial and final states).
- [ ] Missing API key shows a notification, not a crash.
- [ ] Works in Print mode (`pi -p "test message"`): no UI errors, graceful degradation.
- [ ] If using `ctx.ui.custom()`: RPC fallback is exercised (custom returns undefined).

## Testing Hooks

Test event hooks by triggering the relevant actions:

- `tool_call`: Have the LLM call a tool that your hook intercepts.
- `session_before_switch`: Create a new session or switch sessions.
- `input`: Type a message that matches your transform pattern.
- `before_agent_start`: Start any agent turn and verify system prompt modifications.

## Debugging

Extension errors are logged to the pi log file. Check the output for stack traces:

```bash
# View pi logs
pi --log-level debug
```

If an extension fails to load, pi logs the error and continues without it.
