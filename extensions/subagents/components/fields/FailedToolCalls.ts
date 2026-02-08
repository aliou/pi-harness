import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { TruncatedText } from "@mariozechner/pi-tui";
import type { SubagentToolCall } from "../../lib/types";
import { INDICATOR } from "../../lib/ui/spinner";
import type { ToolCallFormatter } from "./ToolCallList";

/**
 * Renders only failed tool calls:
 *   [x] Edit src/broken.ts
 *   [x] Bash npm test
 */
export class FailedToolCalls implements Component {
  constructor(
    private toolCalls: SubagentToolCall[],
    private formatter: ToolCallFormatter,
    private theme: Theme,
  ) {}

  handleInput(_data: string): boolean {
    return false;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const failed = this.toolCalls.filter((tc) => tc.status === "error");
    if (failed.length === 0) return [];

    const th = this.theme;
    const lines: string[] = [];
    for (const tc of failed) {
      const { label, detail } = this.formatter(tc);
      const text = detail ? `${th.bold(label)} ${detail}` : th.bold(label);
      const line = new TruncatedText(
        `${th.fg("error", INDICATOR.error)} ${text}`,
      );
      lines.push(...line.render(width));

      // Add error message if available
      if (tc.error) {
        // Parse error if it's JSON-stringified result object
        let errorText = tc.error;
        try {
          const parsed = JSON.parse(tc.error);
          if (parsed.content?.[0]?.text) {
            errorText = parsed.content[0].text;

            // Try to extract clean error from API error messages
            // e.g., "Exa API error (402): {...}" -> extract the JSON error field
            const apiErrorMatch = errorText.match(/API error \(\d+\): ({.+})$/);
            if (apiErrorMatch?.[1]) {
              try {
                const apiError = JSON.parse(apiErrorMatch[1]);
                if (apiError.error) {
                  errorText = apiError.error;
                }
              } catch {
                // Failed to parse API error, keep original
              }
            }
          }
        } catch {
          // Not JSON, use as-is
        }

        // Truncate very long errors
        if (errorText.length > 150) {
          errorText = `${errorText.slice(0, 147)}...`;
        }

        // Indent error message
        const errorLine = new TruncatedText(`  ${th.fg("dim", errorText)}`);
        lines.push(...errorLine.render(width));
      }
    }
    return lines;
  }
}
