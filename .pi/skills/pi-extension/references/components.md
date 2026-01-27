# Reusable TUI Components

Use `components/` for reusable TUI rendering shared between tools and commands.

## Basic Component

```typescript
// extensions/<name>/components/StatusLine.ts
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";

export class StatusLine implements Component {
  constructor(
    private theme: Theme,
    private text: string,
  ) {}

  render(width: number): string[] {
    return [truncateToWidth(this.theme.fg("muted", this.text), width)];
  }
}
```

## Using in Tools

```typescript
import { Container, Text } from "@mariozechner/pi-tui";
import { StatusLine } from "../components/StatusLine";

renderResult(result, options, theme): Container {
  const container = new Container();
  container.addChild(new Text("Main output...", 0, 0));
  container.addChild(new StatusLine(theme, "provider/model - 12 calls"));
  return container;
}
```

## Common Patterns

### Single-line with truncation

```typescript
render(width: number): string[] {
  return [truncateToWidth(this.text, width)];
}
```

### Multi-line output

```typescript
render(width: number): string[] {
  return this.items.map(item => 
    truncateToWidth(this.formatItem(item), width)
  );
}
```

## Useful TUI Imports

```typescript
import {
  Text,
  Container,
  Component,
  truncateToWidth,
  visibleWidth,
  matchesKey,
} from "@mariozechner/pi-tui";
```
