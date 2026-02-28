# defaults

Sensible defaults and quality-of-life improvements for Pi.

## Features

### Directory-aware read

Overrides the built-in `read` tool to handle directories gracefully. When the agent calls `read` on a directory path, it returns a directory listing (via the native `ls` tool) instead of failing with an `EISDIR` error.

- Files: delegated to native `read` (truncation, image handling, etc.)
- Directories: delegated to native `ls` (sorted entries, truncation)
- Non-existent paths: error from underlying tool

### `get_current_time` tool

Returns the current date and time with structured fields: formatted string, date, time, timezone, timezone name, day of week, and unix timestamp. Supports format parameter: `iso8601` (default), `unix`, `date`, `time`.

### Subdirectory AGENTS.md discovery

Pi's built-in discovery only loads AGENTS.md files from the cwd and its ancestors. This hook fills the gap: when the agent reads a file, it checks for AGENTS.md files in the directories between cwd and the file being read, and sends a custom message for each discovered file.

- Only triggers on `read` tool results (not bash, etc.)
- Sends messages that are visible in the session history (persisted through compaction)
- Collapsed display: "[AGENTS] ~/path/to/AGENTS.md" (accent/bold label, muted path)
- Expanded display: markdown-rendered content of the AGENTS.md file below the header
- Message content is wrapped in `<agents_md>` XML tags with "Automated AGENTS.md file read" prefix
- Deduplicates per session (each AGENTS.md injected at most once)
- Resets on session start/switch
- Skips cwd's own AGENTS.md (already loaded by Pi)
- Falls back to home directory as boundary if file is outside cwd
- Supports global ignore list (`agentsIgnorePaths`) to skip selected AGENTS.md files/directories

### Notifications

Sends OS-level terminal notifications directly (OSC) with optional macOS sounds.

- Plays attention sound when `ask_user` tool is invoked
- For attention/dangerous events, appends ` [!]` to the current terminal title (no emoji)
  - For attention-triggering tool calls (e.g. `ask_user`), marker clears when that tool call finishes
- Sends summary notification when agent finishes (loop count, tool count, error status)
  - Skips done notification when the run ends with assistant `stopReason: "aborted"`
- Listens for `guardrails:dangerous` events and alerts with attention sound
  - event payload shape: `{ command, description, pattern, toolName?, toolCallId? }`
  - `toolName`/`toolCallId` let title attention map to the exact triggering tool call
  - compatibility note: other extensions can emit this same event to reuse the same attention sound path

### Terminal title

Updates the terminal title with a project breadcrumb (e.g. `pi: project > subdir`) and appends the current activity:

- Session start/switch: `pi: <project breadcrumb>`
- Agent running: `pi: <project breadcrumb> (thinking...)`
- Tool call: `pi: <project breadcrumb> (<tool name>)`
- Session shutdown: resets to "Terminal"

Breadcrumbs are built from the project root (detected via `.git`, `.root`, `pnpm-workspace.yaml`) to the current directory, truncated to 2 levels.

### Flexible edit parameters

Overrides the built-in `edit` tool to accept `new_text` as an alias for `newText`. Models sometimes emit `new_text` (snake_case) instead of the expected `newText` (camelCase), causing a validation error. This wrapper normalises either form before delegating to the native implementation. If neither `newText` nor `new_text` is provided, it returns a clear error message.

### Auto session naming

Automatically names sessions based on first user message after first turn completes.

Uses `google/gemini-2.5-flash-lite` to generate a 3-7 word title in sentence case.

### `/theme` command

Theme selector with live preview. Browse all available themes (built-in and custom), preview each one in real-time, and apply with Enter or cancel with Escape to restore the original.

### `/project:init` command

Multi-step wizard to configure packages, skills, and AGENTS.md for the current project.

### `/ad:settings` command

Interactive editor for the extension's config (catalog paths, ignore paths, etc.).

### `/defaults:update` command

Runs `~/.pi/agent/bin/update` to update pinned package refs and refresh installed packages.
