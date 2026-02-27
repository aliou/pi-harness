# modes

Hardcoded mode system for Pi with tool gating, model switching, and per-branch restore.

## Modes

- `default`
  - No tool restrictions
  - No mode label in editor
  - No provider/model override

- `plan`
  - Read-only planning mode
  - Blocks `write`, `edit`, `bash`
  - Provider/model: `openai-codex / gpt-5.3-codex`

- `research`
  - Read-only research mode + restricted bash
  - Blocks `write`, `edit`
  - Allows bash only for allowlisted read/search commands via shell AST parsing
  - Provider/model: `anthropic / claude-opus-4-6`

## Controls

- `/mode` opens selector
- `/mode <default|plan|research>` switches directly
- `Ctrl+U` cycles modes
- `--agent-mode <default|plan|research>` sets startup mode

## Behavior

- Enforced at execution time via `tool_call` hook (not `setActiveTools`)
- Mode state persisted with `appendEntry("mode-state", ...)`
- Restores mode per branch using `sessionManager.getBranch()`
- Appends mode instructions to system prompt on each turn
- Sends UI-visible custom `mode-switch` messages
- Filters `mode-switch` messages out of LLM context via `context` hook

## Notes

- No config file and no enabled toggle by design
- Editor border line color follows normal thinking-level behavior
- Mode label uses hardcoded ANSI colors (plan magenta, research cyan)
