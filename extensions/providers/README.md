# Providers Extension

Rate limiting alerts, usage widgets, and dashboards for AI providers.

## Features

- **Rate Limit Warnings**: Smart, time-aware alerts when approaching limits
- **Usage Bar**: Compact widget showing current provider usage
- **Usage Dashboard**: Interactive `/providers:usage` command with session and historical stats
- **Codex Fast Mode**: Session-local toggle for OpenAI Codex priority service tier, available from the palette

## Commands

- `/providers:usage` - Open usage dashboard (interactive)
- `/providers:settings` - Configure provider-specific settings

## Rate Limit Warnings

Warnings trigger based on **projected usage** (current pace extrapolated to window end) combined with absolute usage guards. The thresholds are dynamic:

- **Early in window**: More lenient (need ~33% absolute usage + 260% projected)
- **Late in window**: Stricter (need only ~8% absolute usage + 120% projected)

This prevents spam at window start while ensuring alerts fire before limits are hit.

### Cooldown Behavior

- **Warning (80-90%)**: 60-minute cooldown per window
- **High/Critical (90%+)**: No cooldown - notifies immediately

## Usage Bar Widget

Shows compact rate limit info below the editor. Configurable per-provider:

- `always` - Always visible
- `warnings-only` - Only when usage is elevated (default)
- `never` - Hidden

## Usage Dashboard

Interactive UI with tabs:

- **Session**: Current rate limits for all providers with hybrid layout (bar + metadata)
- **Today**: Today's usage stats
- **Week**: This week's usage stats  
- **All Time**: All-time usage stats

### Controls

- `Tab/Shift+Tab` or `←/→` - Switch tabs
- `j/k` or `↑/↓` - Scroll
- `Enter` or `Space` - Expand/collapse provider in stats tabs
- `q` or `Esc` - Close

### Session Tab Layout

```
Anthropic ● Operational
Daily tokens (1.2h/5h)
  ████████████████████░░░░░░░░░░░░░░░░░░░░░░ 48%
  proj 89% · 14% ahead pace · resets in 3.8h

Weekly tokens (2.1d/7d)
  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 28%
  proj 93% · within pace · resets in 4.9d
```

The bar shows:
- **Filled portion**: Used percentage
- **│ marker**: Expected pace (where you should be at this point in the window)
- **Color**: Risk level (green/warning/red based on projected usage)

## Configuration

Set per-provider in memory config:

```json
{
  "providers": {
    "anthropic": {
      "widget": "warnings-only",
      "warnings": true
    },
    "openai-codex": {
      "widget": "always",
      "warnings": true
    }
  }
}
```

## Supported Providers

- **Anthropic (Claude)**: Requires `anthropic` auth in Pi
- **OpenAI Codex**: Requires `openai-codex` auth in Pi
- **Synthetic**: Requires `SYNTHETIC_API_KEY` environment variable

## Architecture

### Shared Projection Module

`rate-limits/projection.ts` provides:
- `assessWindowRisk()` - Time-aware risk calculation
- `getPacePercent()` - Window progress calculation
- `getProjectedPercent()` - Extrapolated usage at window end
- `getSeverityColor()` - Map severity to theme colors

Used by both warning hooks and UI rendering for consistent behavior.

### Warning Hook

- Session-local alert state with 60-min cooldown
- Severity escalation tracking (warning → high → critical)
- Non-blocking fetch (fire-and-forget)

### Usage Bar Hook

- Caches rate limits with configurable refresh interval
- Filters Claude windows by model family (Sonnet vs Opus)
- Respects per-provider widget mode
