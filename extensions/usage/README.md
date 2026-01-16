# Usage Extension

The `/usage` command shows current rate limits and historical usage statistics across four tabs.

## Tabs

- **Session**: Live provider rate-limit windows and status indicators.
- **Today**: Usage totals since midnight.
- **Week**: Usage totals since Monday midnight.
- **All Time**: Usage totals across all sessions.

## Controls

- `Tab` / `→`: Next tab
- `Shift+Tab` / `←`: Previous tab
- `q` / `Escape`: Close

## Requirements

- Claude data requires `anthropic` auth configured.
- Codex data requires `openai-codex` auth configured.

Session statistics are collected from local Pi session files under `~/.pi/agent/sessions`.
