# defaults

Sensible defaults and quality-of-life improvements for Pi.

## Features

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
