# Session Management

Session management utilities for Pi.

## Commands

- `session:copy-path` - Copy the current session file path to clipboard
- `session:export-md` - Export current branch to a markdown file

### `session:export-md`

Exports the current session branch to a markdown file. Presents a toggle UI to choose what to include:

- **Tool calls** - Include tool invocations (default: on)
- **Tool results** - Include tool output (default: on)
- **Thinking blocks** - Include model reasoning (default: off)

The exported file is saved to `~/.pi/agent/session-exports/` with YAML frontmatter containing session metadata. The file path is copied to clipboard after export.
