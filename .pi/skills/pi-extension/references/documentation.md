# Documentation

## Extension README Template

```markdown
# Extension Name

Short description.

## Installation

Install via the pi-extensions package:

\`\`\`bash
pi install git:github.com/aliou/pi-extensions
\`\`\`

Or selectively in your `settings.json`:

\`\`\`json
{
  "packages": [
    {
      "source": "git:github.com/aliou/pi-extensions",
      "extensions": ["extensions/<name>"]
    }
  ]
}
\`\`\`

If published to npm, also include:

\`\`\`bash
pi install npm:@aliou/pi-<name>
\`\`\`

## Features

- **Tool**: `tool_name` - what it does
- **Command**: `/command` - interactive panel (if applicable)

## Usage

### Tool (for agent)

\`\`\`
tool_name param="value"
\`\`\`

### Command (interactive)

Run `/command` to open panel.

## Requirements

(Include this section if the extension depends on external binaries, permissions, system services, or environment setup.)

## Future Improvements

- [ ] ...
```

## Root README Update

Add the extension under the appropriate section:
- **UX**: interaction experience improvements
- **Safety**: mistake prevention
- **Context Engineering**: agent reasoning and planning
- **Monitoring**: session health and API usage
- **Tools**: custom tools for external automation
- **Introspection**: understanding Pi itself

Format:
```markdown
### [name](extensions/name/)

Short description paragraph.

[npm](https://www.npmjs.com/package/@aliou/pi-<name>)  <!-- after publishing -->
```

## Notifications

Extensions can emit notifications to alert users.

### Event Channels

| Event | Description |
|-------|-------------|
| `ad:terminal-title` | Updates terminal title bar |
| `ad:notification` | Sends system notification with optional sound |

### Emitting Notifications

```typescript
const NOTIFICATION_EVENT = "ad:notification";

interface NotificationEvent {
  message: string;
  sound?: string;  // Path to .aiff file (macOS)
}

function emitNotification(pi: ExtensionAPI, message: string, sound?: string) {
  const event: NotificationEvent = { message, sound };
  pi.events.emit(NOTIFICATION_EVENT, event);
}

// Usage
emitNotification(pi, "Task completed", "/System/Library/Sounds/Blow.aiff");
```

### Common Sounds (macOS)

```
/System/Library/Sounds/Blow.aiff    # Default notification
/System/Library/Sounds/Ping.aiff    # Attention/alert
/System/Library/Sounds/Glass.aiff   # Success
```

### When to Notify

- User attention required (e.g., dangerous command confirmation)
- Long-running task completed
- Errors that need user intervention
