# The Dumb Zone

Detects when an AI session is degrading and shows a warning widget.

Inspired by [this video](https://www.youtube.com/watch?v=rmvDxxNubIg).

## Detection Methods

### Context Window Utilization (Primary)

Monitors token usage relative to the model's context window. High utilization correlates with degraded response quality.

| Threshold | Default | Post-Compaction |
|-----------|---------|-----------------|
| Warning   | 30%     | 21%             |
| Danger    | 35%     | 24.5%           |
| Critical  | 50%     | 35%             |

After compaction, thresholds are stricter (0.7x multiplier) since hitting high usage after compaction indicates the session should be reset.

### Phrase Patterns (Supplementary)

Detects sycophantic/concerning phrases that indicate the model is in "please the user" mode rather than "be accurate" mode:

- "excellent catch"
- "good catch"
- "you are absolutely right"

## Features

- **Hook**: Runs after each agent turn and keeps a dumb-zone widget in sync
- **Widget**: Shows "YOU HAVE ENTERED THE DUMB ZONE" with context details (30s alert cooldown)
- **Command**: `/dumb-zone-status` - shows current utilization and refreshes widget state

## Configuration

Edit `constants.ts` to adjust thresholds:

```ts
export const CONTEXT_THRESHOLDS = {
  WARNING: 30,
  DANGER: 35,
  CRITICAL: 50,
} as const;

export const POST_COMPACTION_MULTIPLIER = 0.7;

export const DUMB_ZONE_PATTERNS: readonly RegExp[] = [
  /excellent catch/i,
  /good\s+catch/i,
  /you are absolutely right/i,
];

export const WIDGET_ALERT_COOLDOWN_MS = 30000;
```

## Dependencies

- `@aliou/pi-utils-ui` - for themed box rendering
