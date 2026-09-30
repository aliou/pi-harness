import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

const GetCurrentTimeParams = Type.Object({
  format: Type.Optional(
    Type.String({
      description:
        "Output format: 'iso8601' (default), 'unix', 'date', 'time', or custom strftime-like pattern",
    }),
  ),
});

const TimeDetailsSchema = Type.Object({
  formatted: Type.String({ description: "Time in the requested format" }),
  date: Type.String({ description: "Local date, YYYY-MM-DD" }),
  time: Type.String({ description: "Local 24-hour time, HH:MM:SS" }),
  timezone: Type.String({ description: "UTC offset, for example UTC+02:00" }),
  timezone_name: Type.String({ description: "IANA time zone name" }),
  day_of_week: Type.String(),
  unix: Type.Number({ description: "Seconds since the Unix epoch" }),
});

type TimeDetails = Static<typeof TimeDetailsSchema>;

function formatDate(date: Date, format: string): string {
  switch (format.toLowerCase()) {
    case "iso8601":
    case "iso":
      return date.toISOString();
    case "unix":
      return Math.floor(date.getTime() / 1000).toString();
    case "date":
      return date.toLocaleDateString();
    case "time":
      return date.toLocaleTimeString();
    default:
      return date.toISOString();
  }
}

const getCurrentTimeTool = defineTool({
  name: "get_current_time",
  label: "Get Current Time",
  description:
    "Get the current date and time. Returns formatted time along with date, time, timezone, and day of week as separate fields.",
  promptSnippet: "Get the current date and time",
  parameters: GetCurrentTimeParams,
  outputSchema: TimeDetailsSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  promptGuidelines: [
    "get_current_time: Use when you need the current date or time instead of assuming or guessing.",
    "get_current_time: Returns date, time, timezone, and day of week as separate fields.",
  ],

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const now = new Date();
    const format = params.format || "iso8601";

    const formatted = formatDate(now, format);
    const timezoneOffset = -now.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset >= 0 ? "+" : "-";
    const timezone = `UTC${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

    const details: TimeDetails = {
      formatted,
      date: now.toLocaleDateString("en-CA"),
      time: now.toLocaleTimeString("en-GB", { hour12: false }),
      timezone,
      timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone,
      day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
      unix: Math.floor(now.getTime() / 1000),
    };

    const text = [
      `Formatted: ${details.formatted}`,
      `Date: ${details.date}`,
      `Time: ${details.time}`,
      `Timezone: ${details.timezone} (${details.timezone_name})`,
      `Day: ${details.day_of_week}`,
      `Unix: ${details.unix}`,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      details,
      structuredContent: details,
    };
  },

  renderCall(args, theme) {
    return new ToolCallHeader(
      {
        toolName: "Current Time",
        optionArgs: args.format
          ? [{ label: "format", value: args.format }]
          : [],
      },
      theme,
    );
  },

  renderResult(result, { isPartial }, theme) {
    if (isPartial) {
      return new Text(theme.fg("muted", "Getting current time..."), 0, 0);
    }

    const { details } = result as {
      details?: TimeDetails;
      content: Array<{ type: string; text?: string }>;
    };

    if (!details) {
      const text = result.content[0];
      return new Text(
        text?.type === "text" && text.text ? text.text : "No result",
        0,
        0,
      );
    }

    const lines: string[] = [];
    lines.push(
      `${theme.fg("dim", "Date:")} ${theme.fg("accent", details.date)} ${theme.fg("dim", `(${details.day_of_week})`)}`,
    );
    lines.push(
      `${theme.fg("dim", "Time:")} ${theme.fg("accent", details.time)} ${theme.fg("dim", details.timezone_name)}`,
    );

    return new Text(lines.join("\n"), 0, 0);
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(getCurrentTimeTool);
}
