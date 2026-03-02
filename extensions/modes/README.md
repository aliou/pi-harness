# modes

Hardcoded mode system for Pi with tool gating, model switching, and per-branch restore.

## Modes

- `default`
  - No tool restrictions
  - Shows mode label in editor
  - No provider/model override

- `research`
  - Read-only research mode + restricted bash
  - Blocks `write`, `edit`
  - Requires explicit confirmation for each `bash` call
  - Provider/model: `anthropic / claude-opus-4-6`

## Controls

- `/mode` opens selector
- `/mode <default|research>` switches directly
- `Ctrl+U` cycles modes
- `--agent-mode <default|research>` sets startup mode

## Behavior

- Enforced at execution time via `tool_call` hook (not `setActiveTools`)
- Mode state persisted with `appendEntry("mode-state", ...)`
- Restores mode per branch using `sessionManager.getBranch()`
- Appends mode instructions to system prompt on each turn
- Sends UI-visible custom `mode-switch` messages
- Filters `mode-switch` messages out of LLM context via `context` hook
- Emits `guardrails:dangerous` compatibility events when user attention is required by tool gating:
  - when `bash` is blocked by mode deny rules
  - when confirmation is required for a non-allowlisted tool

## Event compatibility pattern

For cross-extension notification/sound interoperability, emit this event shape:

```ts
pi.events.emit("guardrails:dangerous", {
  command: string,
  description: string,
  pattern: string,
  toolName?: string,
  toolCallId?: string,
});
```

`defaults` listens for this event, plays the attention sound, and uses `toolName`/`toolCallId` (when present) to keep terminal-title attention aligned with the exact triggering tool call.

## Notes

- No config file and no enabled toggle by design
- Editor border line color follows normal thinking-level behavior
- Mode label uses hardcoded ANSI color (research cyan)
