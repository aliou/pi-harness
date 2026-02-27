# modes

Hardcoded mode system for Pi with tool gating and model switching.

## Modes

- `default`: no restrictions.
- `plan`: read-only tooling, planning-focused instructions.
- `research`: read-only tooling + restricted bash.

## Controls

- `/mode`
- `/mode <default|plan|research>`
- `Ctrl+U` cycle
- `--agent-mode <default|plan|research>`

## Notes

- No config file and no `enabled` toggle by design.
- Uses `tool_call` hook for enforcement (not `setActiveTools`).
- Persists mode per branch via custom `mode-state` entries.
- Injects mode guidance via `before_agent_start`.
- Sends `mode-switch` UI messages and filters them from LLM context.
