# defaults

Sensible defaults and quality-of-life improvements for Pi.

## Features

### Directory-aware read

Overrides the built-in `read` tool to handle directories gracefully. When the agent calls `read` on a directory path, it returns a directory listing (via the native `ls` tool) instead of failing with an `EISDIR` error.

- Files: delegated to native `read` (truncation, image handling, etc.)
- Directories: delegated to native `ls` (sorted entries, truncation)
- Non-existent paths: error from underlying tool

### Auto theme (macOS)

Automatically syncs Pi's theme with macOS system appearance (dark/light mode).

- Only runs on macOS and when UI is available
- Checks system appearance every 2 seconds
- Switches to `dark` or `light` theme automatically
- Stops monitoring when session ends

### Subdirectory AGENTS.md discovery

Pi's built-in discovery only loads AGENTS.md files from the cwd and its ancestors. This hook fills the gap: when the agent reads a file, it checks for AGENTS.md files in the directories between cwd and the file being read, and injects their content alongside the tool result.

- Only triggers on `read` tool results (not bash, etc.)
- Deduplicates per session (each AGENTS.md injected at most once)
- Resets on session start/switch
- Skips cwd's own AGENTS.md (already loaded by Pi)
- Falls back to home directory as boundary if file is outside cwd

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
