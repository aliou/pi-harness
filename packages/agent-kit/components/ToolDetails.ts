import type {
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text } from "@mariozechner/pi-tui";

/** A field is either a plain label/value or a custom Component */
export type ToolDetailsField =
  | { label: string; value: string; showCollapsed?: boolean }
  | (Component & { showCollapsed?: boolean });

export interface ToolDetailsConfig {
  /** Fields to display when expanded */
  fields: ToolDetailsField[];
  /** Footer component -- always displayed */
  footer: Component;
}

/**
 * Collapsed: empty line + footer.
 * Expanded: fields + empty line + footer.
 */
export class ToolDetails implements Component {
  constructor(
    private config: ToolDetailsConfig,
    private options: ToolRenderResultOptions,
    private theme: Theme,
  ) {}

  handleInput(_data: string): boolean {
    return false;
  }

  invalidate(): void {}

  update(config: ToolDetailsConfig, options: ToolRenderResultOptions): void {
    this.config = config;
    this.options = options;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const th = this.theme;

    const fieldsToRender = this.options.expanded
      ? this.config.fields
      : this.config.fields.filter(
          (f) => "showCollapsed" in f && f.showCollapsed,
        );

    for (const field of fieldsToRender) {
      if (isComponent(field)) {
        lines.push(...field.render(width));
      } else {
        const text = new Text(
          `${th.fg("muted", `${field.label}: `)}${field.value}`,
          0,
          0,
        );
        lines.push(...text.render(width));
      }
    }

    lines.push("");
    lines.push(...this.config.footer.render(width));
    return lines;
  }
}

function isComponent(field: ToolDetailsField): field is Component {
  return "render" in field && typeof (field as Component).render === "function";
}
