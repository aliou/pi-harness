# Breadcrumbs

Session history tools for Pi. Search past sessions, extract information from them, and hand off context to new sessions.

## Tools

### `find_sessions`

Search past Pi sessions by keyword. Returns matching sessions with metadata.

**Parameters:**
- `query` (required): Keyword to search for
- `cwd`: Filter to sessions from a specific working directory
- `after`: Filter to sessions after a date (ISO or relative: `7d`, `2w`, `1m`)
- `before`: Filter to sessions before a date
- `limit`: Max results (default: 10, max: 100)

### `read_session`

Extract information from a past session using a subagent.

**Parameters:**
- `sessionId` (required): Session UUID or file path
- `goal` (required): What information to extract

The subagent has access to session-specific tools (get_session_overview, get_messages, find_messages, etc.) and uses them to answer the goal.

### `handoff` (optional)

Extract context from the current session for starting a new one. Disabled by default.

**Parameters:**
- `goal` (required): Description of the task for the new session

## Commands

- `session:copy-path` - Copy the current session file path to clipboard
- `session:copy-id` - Copy the current session ID to clipboard
- `/handoff <goal>` - Create a new session with extracted context

The `/handoff` command extracts relevant context, lets you review and edit the prompt, then creates a new session with that context.

## Configuration

Create `~/.pi/agent/extensions/breadcrumbs.json` or `.pi/extensions/breadcrumbs.json`:

```json
{
  "handoffTool": true
}
```

**Options:**
- `handoffTool` (boolean, default: `false`): Enable the `handoff` tool for agent use

## Session Protection

The extension gates direct agent access to the sessions directory (`~/.pi/agent/sessions`).

- Direct **read** attempts trigger a user confirmation prompt (UI required). Approval is remembered for the rest of the current Pi session.
- Direct **write/edit** attempts remain blocked.
- Direct **bash** commands referencing the sessions directory remain blocked.

Agents should prefer `find_sessions` and `read_session` instead of reading raw session JSONL.
