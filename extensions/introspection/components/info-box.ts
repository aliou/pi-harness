import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

/**
 * Render a bordered box with a title and body text.
 *
 *   ┌─ Title ──────────────┐
 *   │ Body line 1           │
 *   │ Body line 2           │
 *   └───────────────────────┘
 *
 * Follows the same visual pattern used for skill boxes in the system prompt.
 */
export function renderInfoBox(
  title: string,
  body: string,
  width: number,
  theme: Theme,
): string[] {
  if (width < 10) {
    return [truncateToWidth(title, width)];
  }

  const innerWidth = width - 4; // border + 1 char padding each side

  // Top: ┌─ title ──────┐
  const maxNameLen = Math.max(0, width - 6);
  const displayName = truncateToWidth(title, maxNameLen);
  const nameVisible = visibleWidth(displayName);
  const topFill = Math.max(0, width - nameVisible - 5);
  const top =
    theme.fg("borderMuted", "┌─") +
    theme.fg("accent", theme.bold(` ${displayName} `)) +
    theme.fg("borderMuted", `${"─".repeat(topFill)}┐`);

  // Body: │ text │
  const bodyLines = body.length > 0 ? wrapTextWithAnsi(body, innerWidth) : [""];

  const rows = bodyLines.map((line) => {
    const padLen = Math.max(0, innerWidth - visibleWidth(line));
    return (
      theme.fg("borderMuted", "│") +
      ` ${line}${" ".repeat(padLen)} ` +
      theme.fg("borderMuted", "│")
    );
  });

  // Bottom: └──────────────┘
  const bottom = theme.fg(
    "borderMuted",
    `└${"─".repeat(Math.max(0, width - 2))}┘`,
  );

  return [top, ...rows, bottom];
}

/**
 * Render a bordered box with a title and pre-built content lines.
 * Use when the body needs custom formatting (multiple styled lines, etc.)
 * rather than a single wrapped string.
 */
export function renderInfoBoxLines(
  title: string,
  bodyLines: string[],
  width: number,
  theme: Theme,
): string[] {
  if (width < 10) {
    return [truncateToWidth(title, width)];
  }

  const innerWidth = width - 4;

  // Top
  const maxNameLen = Math.max(0, width - 6);
  const displayName = truncateToWidth(title, maxNameLen);
  const nameVisible = visibleWidth(displayName);
  const topFill = Math.max(0, width - nameVisible - 5);
  const top =
    theme.fg("borderMuted", "┌─") +
    theme.fg("accent", theme.bold(` ${displayName} `)) +
    theme.fg("borderMuted", `${"─".repeat(topFill)}┐`);

  // Rows
  const lines = bodyLines.length > 0 ? bodyLines : [""];
  const rows = lines.map((line) => {
    const padLen = Math.max(0, innerWidth - visibleWidth(line));
    return (
      theme.fg("borderMuted", "│") +
      ` ${line}${" ".repeat(padLen)} ` +
      theme.fg("borderMuted", "│")
    );
  });

  // Bottom
  const bottom = theme.fg(
    "borderMuted",
    `└${"─".repeat(Math.max(0, width - 2))}┘`,
  );

  return [top, ...rows, bottom];
}
