import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text, TruncatedText } from "@mariozechner/pi-tui";

export interface ToolPreviewField {
  label: string;
  value: string;
}

export interface ToolPreviewConfig {
  title: string;
  fields: ToolPreviewField[];
}

/**
 * Renders:
 *   Title (bold, toolTitle color)
 *     Label: value (wraps if long)
 *     Label: value
 */
export class ToolPreview implements Component {
  constructor(
    private config: ToolPreviewConfig,
    private theme: Theme,
  ) {}

  handleInput(_data: string): boolean {
    return false;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const lines: string[] = [];
    const th = this.theme;

    // Title (single line, truncate if absurdly long)
    const title = new TruncatedText(
      th.fg("toolTitle", th.bold(this.config.title)),
    );
    lines.push(...title.render(width));

    // Fields: label prefix + wrapped value
    for (const field of this.config.fields) {
      const prefix = `${th.fg("muted", `${field.label}: `)}`;
      const text = new Text(prefix + field.value, 0, 0);
      lines.push(...text.render(width));
    }

    return lines;
  }
}
