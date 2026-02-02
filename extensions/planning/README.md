# Planning

Commands for turning conversations into implementation plans and managing saved plans.

## Features

- **Command**: `/plan:save` - creates a structured plan from the current conversation
- **Command**: `/plan:list` - lists saved plans with options to execute, edit, or archive

## Tools

### `ask_user`

Gather user input during task execution through structured multiple-choice questions. Present 1-4 questions at once, each with 2-4 predefined options. Users can always choose "Other" to provide custom text. Supports single-select or multi-select mode.

## Usage

### Creating Plans

Run `/plan:save` to generate a plan from the current conversation. The agent will analyze the discussion and create a structured implementation plan in `.agents/plans/`.

### Managing Plans

Run `/plan:list` to see all saved plans. Select a plan to:
- **Execute** - Run the plan (optionally in a new session)
- **Edit** - Open the plan in your `$VISUAL/$EDITOR`
- **Archive** - Move the plan to an archive directory

## Configuration

Create `~/.pi/agent/extensions/planning.json` to configure archiving:

```json
{
  "archiveDir": "/path/to/plan-archive"
}
```

The `archiveDir` should point to a git repository. When archiving, the extension will:
1. Move the plan file to the archive directory
2. Stage the change
3. Commit with message "Archive plan: <filename>"
4. Push to remote (silently)

If any git operation fails, you'll receive a notification but the plan will still be archived locally.
