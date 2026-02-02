import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { findPiInstallation } from "./utils";

const ChangelogParams = Type.Object({
  version: Type.Optional(
    Type.String({
      description:
        "Specific version to get changelog for. If not provided, returns latest version.",
    }),
  ),
});

type ChangelogParamsType = Static<typeof ChangelogParams>;

interface ChangelogEntry {
  version: string;
  content: string;
  allVersions?: string[];
}

interface ChangelogDetails {
  success: boolean;
  message: string;
  changelog?: ChangelogEntry;
  installPath?: string;
}

type ExecuteResult = AgentToolResult<ChangelogDetails>;

// Helper function to parse changelog
function parseChangelog(
  changelogContent: string,
  requestedVersion?: string,
): {
  success: boolean;
  changelog?: ChangelogEntry;
  message: string;
} {
  try {
    const lines = changelogContent.split("\n");
    const versionEntries: Array<{
      version: string;
      content: string;
      lineStart: number;
      lineEnd: number;
    }> = [];

    // Find version headers (## [version] or ## version or # [version] etc.)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const versionMatch = line
        .trim()
        .match(/^#+\s*(?:\[([^\]]+)\]|([^[\s]+))/);
      if (versionMatch) {
        const version = versionMatch[1] || versionMatch[2];
        // Skip non-version headers (like "Unreleased", "Overview", etc.)
        if (version && /^v?\d+\.\d+/.test(version)) {
          versionEntries.push({
            version: version,
            content: "",
            lineStart: i,
            lineEnd: -1,
          });
        }
      }
    }

    // Set end lines for each version entry
    for (let i = 0; i < versionEntries.length; i++) {
      const entry = versionEntries[i];
      if (!entry) continue;
      const nextEntry = versionEntries[i + 1];
      const nextStart = nextEntry ? nextEntry.lineStart : lines.length;
      entry.lineEnd = nextStart;

      // Extract content for this version
      const contentLines = lines.slice(entry.lineStart + 1, entry.lineEnd);
      const rawContent = contentLines.join("\n").trim();

      // Check if content is effectively empty (only whitespace, horizontal rules, or very short)
      const cleanContent = rawContent
        .replace(/^-+$|^=+$|^\*+$|^#+$/gm, "")
        .trim();
      if (!cleanContent || cleanContent.length < 10) {
        entry.content =
          "[Empty changelog entry - no details provided for this version]";
      } else {
        entry.content = rawContent;
      }
    }

    if (versionEntries.length === 0) {
      return {
        success: false,
        message: "No version entries found in changelog",
      };
    }

    const allVersions = versionEntries.map((entry) => entry.version);

    // If specific version requested, find it
    if (requestedVersion) {
      const normalizedRequested = requestedVersion.replace(/^v/, "");
      const entry = versionEntries.find(
        (e) =>
          e.version === requestedVersion ||
          e.version === `v${normalizedRequested}` ||
          e.version.replace(/^v/, "") === normalizedRequested,
      );

      if (entry) {
        return {
          success: true,
          changelog: {
            version: entry.version,
            content: entry.content,
            allVersions,
          },
          message: `Found changelog for version ${entry.version}`,
        };
      } else {
        return {
          success: false,
          message: `Version ${requestedVersion} not found in changelog. Available versions: ${allVersions.join(", ")}`,
        };
      }
    }

    // Return latest version (first entry)
    const latest = versionEntries[0];
    if (!latest) {
      return {
        success: false,
        message: "No version entries found in changelog",
      };
    }
    return {
      success: true,
      changelog: {
        version: latest.version,
        content: latest.content,
        allVersions,
      },
      message: `Latest changelog entry: ${latest.version}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error parsing changelog: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function setupChangelogTool(pi: ExtensionAPI) {
  pi.registerTool<typeof ChangelogParams, ChangelogDetails>({
    name: "pi_changelog",
    label: "Pi Changelog",
    description:
      "Get changelog entries from the Pi installation. Returns latest version by default, or specify a version parameter.",

    parameters: ChangelogParams,

    async execute(
      _toolCallId: string,
      params: ChangelogParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        const piPath = findPiInstallation();
        if (!piPath) {
          return {
            content: [
              {
                type: "text",
                text: "Could not locate running Pi installation directory",
              },
            ],
            details: {
              success: false,
              message: "Could not locate running Pi installation directory",
            },
          };
        }

        // Look for changelog files
        const changelogPaths = [
          path.join(piPath, "CHANGELOG.md"),
          path.join(piPath, "CHANGELOG.MD"),
          path.join(piPath, "changelog.md"),
          path.join(piPath, "Changelog.md"),
          path.join(piPath, "HISTORY.md"),
          path.join(piPath, "RELEASES.md"),
        ];

        let changelogPath: string | null = null;
        for (const candidatePath of changelogPaths) {
          if (fs.existsSync(candidatePath)) {
            changelogPath = candidatePath;
            break;
          }
        }

        if (!changelogPath) {
          return {
            content: [
              {
                type: "text",
                text: `No changelog file found in Pi installation at ${piPath}`,
              },
            ],
            details: {
              success: false,
              message: `No changelog file found in Pi installation at ${piPath}`,
              installPath: piPath,
            },
          };
        }

        const changelogContent = fs.readFileSync(changelogPath, "utf-8");
        const parseResult = parseChangelog(changelogContent, params.version);

        if (!parseResult.success) {
          return {
            content: [{ type: "text", text: parseResult.message }],
            details: {
              success: false,
              message: parseResult.message,
              installPath: piPath,
            },
          };
        }

        const { changelog } = parseResult;
        if (!changelog) {
          return {
            content: [{ type: "text", text: "No changelog data found" }],
            details: {
              success: false,
              message: "No changelog data found",
              installPath: piPath,
            },
          };
        }

        const isEmptyEntry = changelog.content.startsWith(
          "[Empty changelog entry",
        );
        let message = `${parseResult.message} (from ${changelogPath})`;
        message += `\n\n## ${changelog.version}\n\n${changelog.content}`;

        if (isEmptyEntry) {
          message +=
            "\n\nNOTE: This version has no changelog details. This is the complete information available for this version.";
        }

        if (changelog.allVersions && changelog.allVersions.length > 1) {
          message += `\n\nAll available versions: ${changelog.allVersions.join(", ")}`;
        }

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message: `${parseResult.message} (from ${changelogPath})`,
            changelog,
            installPath: piPath,
          },
        };
      } catch (error) {
        const message = `Error reading Pi changelog: ${error instanceof Error ? error.message : String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: {
            success: false,
            message,
          },
        };
      }
    },

    renderCall(args: ChangelogParamsType, theme: Theme): Text {
      let text = theme.fg("toolTitle", theme.bold("pi_changelog"));
      if (args.version) {
        text += ` ${theme.fg("muted", `v${args.version}`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<ChangelogDetails>,
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

      if (!details.success) {
        return new Text(theme.fg("error", `✗ ${details.message}`), 0, 0);
      }

      if (!details.changelog) {
        return new Text(theme.fg("success", details.message), 0, 0);
      }

      const lines: string[] = [];
      lines.push(theme.fg("success", `✓ ${details.message}`));
      lines.push("");

      lines.push(theme.fg("accent", `Version: ${details.changelog.version}`));
      lines.push("");

      // Split changelog content into lines and format
      const changelogLines = details.changelog.content.split("\n");
      const isEmptyEntry = details.changelog.content.startsWith(
        "[Empty changelog entry",
      );

      for (const line of changelogLines) {
        if (isEmptyEntry) {
          // Highlight empty entries clearly
          lines.push(theme.fg("warning", theme.italic(line)));
        } else if (line.trim().startsWith("###")) {
          lines.push(theme.fg("warning", line));
        } else if (line.trim().startsWith("##")) {
          lines.push(theme.fg("accent", line));
        } else if (line.trim().startsWith("#")) {
          lines.push(theme.fg("accent", theme.bold(line)));
        } else if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
          lines.push(theme.fg("dim", line));
        } else {
          lines.push(line);
        }
      }

      if (
        details.changelog.allVersions &&
        details.changelog.allVersions.length > 1
      ) {
        lines.push("");
        lines.push(
          theme.fg(
            "muted",
            `Available versions: ${details.changelog.allVersions.join(", ")}`,
          ),
        );
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
