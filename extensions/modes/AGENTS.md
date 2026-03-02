# modes

Hardcoded mode system for Pi with tool gating and model switching.

## Modes

- `default`: no restrictions, mode label shown in editor.
- `research`: read-only tooling + restricted bash (explicit confirm per call).

## Controls

- `/mode`
- `/mode <default|research>`
- `Ctrl+U` cycle
- `--agent-mode <default|research>`

## Notes

- No config file and no `enabled` toggle by design.
- Uses `tool_call` hook for enforcement (not `setActiveTools`).
- Persists mode per branch via custom `mode-state` entries.
- Injects mode guidance via `before_agent_start`.
- Sends `mode-switch` UI messages and filters them from LLM context.
