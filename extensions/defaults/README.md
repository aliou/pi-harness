# defaults

Sensible defaults and quality-of-life improvements for Pi.

## Features

### Hashline editing (optional)

Enable line-addressable editing with content hash verification. When enabled, overrides `read` and `edit` tools to use the hashline format from [oh-my-pi](https://github.com/can1357/oh-my-pi).

**How it works:**
- Each line in read output is prefixed with `LINE:HASH|` (e.g., `5:a3|function foo()`)
- Edit operations reference lines by their hash tags instead of reproducing content
- Hash validation prevents stale edits from corrupting files

**Enable via settings command:** `/defaults:settings`

Or manually in config:
- Global: `~/.pi/agent/extensions/defaults.json`
- Local: `{project}/.pi/extensions/defaults.json`

```json
{
  "hashlineEnabled": true
}
```

Changes take effect after saving in the settings UI (uses dynamic tool activation).

**Edit operations:**
- `set_line`: Replace a single line
- `replace_lines`: Replace a range of lines
- `insert_after`: Insert new lines after a specific line

**Benefits:**
- Models don't need to reproduce exact whitespace
- ~20-30% fewer output tokens
- Stale edits fail cleanly with correct hashes shown
- Particularly effective with weaker models

**Note:** When enabled, replaces both the directory-aware read tool and the standard edit tool. Disabled by default.

### Directory-aware read

Overrides the built-in `read` tool to handle directories gracefully. When the agent calls `read` on a directory path, it returns a directory listing (via the native `ls` tool) instead of failing with an `EISDIR` error.

- Files: delegated to native `read` (truncation, image handling, etc.)
- Directories: delegated to native `ls` (sorted entries, truncation)
- Non-existent paths: error from underlying tool

### `get_current_time` tool

Returns the current date and time with structured fields: formatted string, date, time, timezone, timezone name, day of week, and unix timestamp. Supports format parameter: `iso8601` (default), `unix`, `date`, `time`.

### Subdirectory AGENTS.md discovery

Pi's built-in discovery only loads AGENTS.md files from the cwd and its ancestors. This hook fills the gap: when the agent reads a file, it checks for AGENTS.md files in the directories between cwd and the file being read, and injects their content alongside the tool result.

- Only triggers on `read` tool results (not bash, etc.)
- Deduplicates per session (each AGENTS.md injected at most once)
- Resets on session start/switch
- Skips cwd's own AGENTS.md (already loaded by Pi)
- Falls back to home directory as boundary if file is outside cwd
- Supports global ignore list (`agentsIgnorePaths`) to skip selected AGENTS.md files/directories

### Git rebase helper

Intercepts git rebase commands that would hang in a non-interactive environment. Blocks the command and provides the correct syntax with `GIT_SEQUENCE_EDITOR` or `GIT_EDITOR` environment variables.

- Interactive rebase (`git rebase -i`): suggests `GIT_SEQUENCE_EDITOR=: GIT_EDITOR=true`
- Rebase continue: suggests `GIT_EDITOR=true` or `--no-edit`
- Skips commands that already set editor-related env vars

### Notifications

Emits notification events consumed by the [presenter extension](../presenter/).

- Plays attention sound when `ask_user` tool is invoked
- Sends summary notification when agent finishes (loop count, tool count, error status)

### Terminal title

Updates the terminal title with a project breadcrumb (e.g. `pi: project > subdir`) and appends the current activity:

- Session start/switch: `pi: <project breadcrumb>`
- Agent running: `pi: <project breadcrumb> (thinking...)`
- Tool call: `pi: <project breadcrumb> (<tool name>)`
- Session shutdown: resets to "Terminal"

Breadcrumbs are built from the project root (detected via `.git`, `.root`, `pnpm-workspace.yaml`) to the current directory, truncated to 2 levels.

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

### `/theme` command

Theme selector with live preview. Browse all available themes (built-in and custom), preview each one in real-time, and apply with Enter or cancel with Escape to restore the original.
