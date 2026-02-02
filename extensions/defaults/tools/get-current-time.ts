import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

const GetCurrentTimeParams = Type.Object({
  format: Type.Optional(
    Type.String({
      description:
        "Output format: 'iso8601' (default), 'unix', 'date', 'time', or custom strftime-like pattern",
    }),
  ),
});
type GetCurrentTimeParamsType = Static<typeof GetCurrentTimeParams>;

interface TimeDetails {
  formatted: string;
  date: string;
  time: string;
  timezone: string;
  timezone_name: string;
  day_of_week: string;
  unix: number;
}

type ExecuteResult = AgentToolResult<TimeDetails>;

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
      // For custom formats, return ISO8601
      return date.toISOString();
  }
}

export function setupGetCurrentTimeTool(pi: ExtensionAPI) {
  pi.registerTool<typeof GetCurrentTimeParams, TimeDetails>({
    name: "get_current_time",
    label: "Get Current Time",
    description:
      "Get the current date and time. Returns formatted time along with date, time, timezone, and day of week as separate fields.",
    parameters: GetCurrentTimeParams,

    async execute(
      _toolCallId: string,
      params: GetCurrentTimeParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
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
        date: now.toLocaleDateString("en-CA"), // YYYY-MM-DD format
        time: now.toLocaleTimeString("en-GB", { hour12: false }), // HH:MM:SS format
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
      };
    },

    renderCall(args: GetCurrentTimeParamsType, theme: Theme): Text {
      let text = theme.fg("toolTitle", theme.bold("get_current_time"));
      if (args.format) {
        text += ` ${theme.fg("accent", args.format)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<TimeDetails>,
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
}
