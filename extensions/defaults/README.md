# defaults

Sensible defaults and quality-of-life improvements for Pi.

## Features

### Auto theme (macOS)

Automatically syncs Pi's theme with macOS system appearance (dark/light mode).

- Only runs on macOS and when UI is available
- Checks system appearance every 2 seconds
- Switches to `dark` or `light` theme automatically
- Stops monitoring when session ends

### Custom header

Pi logo with version number.

### Auto session naming

Automatically names sessions based on first user message after first turn completes.

Uses `google/gemini-2.5-flash-lite` to generate a 3-7 word title in sentence case.

### `/ad-name` command

| Command | Behavior |
|---------|----------|
| `/ad-name` | No name set: auto-generate. Has name: display current + hint |
| `/ad-name foo` | Set name to "foo" |
| `/ad-name auto` | Force regenerate via LLM |
