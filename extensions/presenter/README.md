# Presenter Extension

Handles terminal-specific presentation for events emitted by other extensions.

## Architecture

This extension subscribes to events and translates them to terminal output:

- **Terminal titles** - OSC sequences to update window/tab title
- **System notifications** - OSC sequences for iTerm2, Kitty, Ghostty, etc.
- **Sound alerts** - macOS `afplay` for audio feedback

## Event Channels

| Event | Description |
|-------|-------------|
| `ad:terminal-title` | Updates terminal title bar |
| `ad:notification` | Sends system notification with optional sound |

## Event Interfaces

```typescript
interface TerminalTitleEvent {
  title: string;
}

interface NotificationEvent {
  message: string;
  sound?: string;  // Path to .aiff file (macOS)
}
```

## Usage

Other extensions emit events without knowing about presentation:

```typescript
// Emit terminal title change
pi.events.emit("ad:terminal-title", { title: "Pi: my-project" });

// Emit notification with sound
pi.events.emit("ad:notification", {
  message: "Task completed",
  sound: "/System/Library/Sounds/Blow.aiff"
});
```

## Mode Awareness

The presenter only outputs when `hasUI === true`:
- **Interactive mode**: OSC sequences and sounds work
- **RPC mode**: Events are silently ignored (no stdout pollution)

## Terminal Support

### Title (OSC 0)
Works in: iTerm2, Terminal.app, Kitty, WezTerm, Ghostty, most modern terminals

### Notifications
- **OSC 9**: Ghostty, ConEmu
- **OSC 777**: iTerm2, WezTerm, Kitty

### Sounds
macOS only, using `afplay`. Common system sounds:
- `/System/Library/Sounds/Blow.aiff` - Default notification
- `/System/Library/Sounds/Ping.aiff` - Attention/alert
- `/System/Library/Sounds/Glass.aiff` - Success
