import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { createLsTool, createReadTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

/**
 * Register tool overrides for the defaults extension.
 *
 * The `read` tool is overridden to detect directories: if the path is a
 * directory, delegate to the native `ls` tool instead of erroring with EISDIR.
 */
export function setupTools(pi: ExtensionAPI): void {
  const cwd = process.cwd();

  const nativeRead = createReadTool(cwd);
  const nativeLs = createLsTool(cwd);

  pi.registerTool({
    ...nativeRead,
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      const { path } = params as {
        path: string;
        offset?: number;
        limit?: number;
      };

      // Resolve path relative to extension context's working directory
      const absolutePath = resolve(ctx.cwd, path);

      try {
        const stat = await lstat(absolutePath);

        if (stat.isDirectory()) {
          // Warn user that read was called on a directory (temporary, for monitoring)
          ctx.ui.notify(`read called on directory: ${path}`, "info");

          // Delegate to native ls when reading a directory
          return nativeLs.execute(toolCallId, { path }, signal);
        }
      } catch {
        // Path does not exist or cannot be accessed - let nativeRead handle the error
      }

      // Fall back to native read behavior for files (or let it error naturally)
      return nativeRead.execute(
        toolCallId,
        params as { path: string; offset?: number; limit?: number },
        signal,
        onUpdate,
      );
    },
  });

  // Register the get_current_time tool
  setupCurrentTimeTool(pi);
}

// ─────────────────────────────────────────────────────────────────────────────
// get_current_time tool
// ─────────────────────────────────────────────────────────────────────────────

const CurrentTimeParams = Type.Object({
  format: Type.Optional(
    Type.String({
      description:
        'Optional datetime format string. Uses date-fns format tokens (e.g., "yyyy-MM-dd HH:mm:ss"). Defaults to ISO8601 with timezone offset.',
    }),
  ),
});

type CurrentTimeParamsType = Static<typeof CurrentTimeParams>;

interface CurrentTimeDetails {
  /** Formatted datetime string (ISO8601 with timezone offset by default, or custom format if provided) */
  formatted: string;
  /** Date portion in YYYY-MM-DD format */
  date: string;
  /** Time portion in HH:MM:SS format (24-hour) */
  time: string;
  /** Timezone offset string (e.g., "+05:30", "-08:00", "Z") */
  timezone: string;
  /** IANA timezone identifier if available (e.g., "America/New_York") */
  timezone_name: string;
  /** Day of the week in English, lowercase (e.g., "monday", "tuesday") */
  day_of_week: string;
}

const DAYS_OF_WEEK = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * Format a date using a format string with common tokens.
 * Supports: yyyy, MM, dd, HH, mm, ss, SSS
 */
function formatDate(date: Date, formatStr: string): string {
  const pad = (n: number, width = 2) => n.toString().padStart(width, "0");

  const tokens: Record<string, string> = {
    yyyy: date.getFullYear().toString(),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3),
  };

  let result = formatStr;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(token, "g"), value);
  }
  return result;
}

/**
 * Get timezone offset string in ±HH:MM format
 */
function getTimezoneOffset(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();
  if (offsetMinutes === 0) return "Z";

  const sign = offsetMinutes > 0 ? "-" : "+";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;

  return `${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Try to get the IANA timezone name
 */
function getTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Unknown";
  }
}

function setupCurrentTimeTool(pi: ExtensionAPI) {
  pi.registerTool<typeof CurrentTimeParams, CurrentTimeDetails>({
    name: "get_current_time",
    label: "Get Current Time",
    description:
      "Returns the current date and time. By default returns ISO8601 format with timezone offset. Optionally accepts a format string.",
    parameters: CurrentTimeParams,

    async execute(
      _toolCallId: string,
      params: CurrentTimeParamsType,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<CurrentTimeDetails>> {
      const now = new Date();

      // Build formatted string
      let formatted: string;
      if (params.format) {
        formatted = formatDate(now, params.format);
      } else {
        // Default: ISO8601 with timezone offset
        formatted = now.toISOString().replace("Z", getTimezoneOffset(now));
        // If local timezone is UTC, keep the Z
        if (now.getTimezoneOffset() === 0) {
          formatted = now.toISOString();
        }
      }

      const details: CurrentTimeDetails = {
        formatted,
        date: formatDate(now, "yyyy-MM-dd"),
        time: formatDate(now, "HH:mm:ss"),
        timezone: getTimezoneOffset(now),
        timezone_name: getTimezoneName(),
        day_of_week: DAYS_OF_WEEK[now.getDay()],
      };

      // Build content text for the agent
      const contentText = [
        `Formatted: ${details.formatted}`,
        `Date: ${details.date}`,
        `Time: ${details.time}`,
        `Timezone: ${details.timezone} (${details.timezone_name})`,
        `Day of week: ${details.day_of_week}`,
      ].join("\n");

      return {
        content: [{ type: "text", text: contentText }],
        details,
      };
    },

    renderCall(args: CurrentTimeParamsType, theme: Theme): Text {
      const label = theme.fg("toolTitle", theme.bold("get_current_time"));
      if (args.format) {
        return new Text(
          `${label} format=${theme.fg("accent", args.format)}`,
          0,
          0,
        );
      }
      return new Text(label, 0, 0);
    },

    renderResult(
      result: AgentToolResult<CurrentTimeDetails>,
      _options: ToolRenderResultOptions,
      theme: Theme,
    ): Text {
      const { details } = result;

      if (!details) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" && text.text ? text.text : "No result",
          0,
          0,
        );
      }

      return new Text(
        theme.fg("success", `${details.formatted} (${details.day_of_week})`),
        0,
        0,
      );
    },
  });
}
