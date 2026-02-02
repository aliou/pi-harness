import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { findPiInstallation } from "./utils";

const GITHUB_RAW_CHANGELOG_URL =
  "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/CHANGELOG.md";

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
  source?: "local" | "github";
}

type ExecuteResult = AgentToolResult<ChangelogDetails>;

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const versionMatch = line
        .trim()
        .match(/^#+\s*(?:\[([^\]]+)\]|([^[\s]+))/);
      if (versionMatch) {
        const version = versionMatch[1] || versionMatch[2];
        if (version && /^v?\d+\.\d+/.test(version)) {
          versionEntries.push({
            version,
            content: "",
            lineStart: i,
            lineEnd: -1,
          });
        }
      }
    }

    for (let i = 0; i < versionEntries.length; i++) {
      const entry = versionEntries[i];
      if (!entry) continue;
      const nextEntry = versionEntries[i + 1];
      const nextStart = nextEntry ? nextEntry.lineStart : lines.length;
      entry.lineEnd = nextStart;

      const contentLines = lines.slice(entry.lineStart + 1, entry.lineEnd);
      const rawContent = contentLines.join("\n").trim();

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
      }
      return {
        success: false,
        message: `Version ${requestedVersion} not found in changelog. Available versions: ${allVersions.join(", ")}`,
      };
    }

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

/** Check if the requested version is newer than the installed VERSION. */
function isNewerThanInstalled(requestedVersion: string): boolean {
  const normalize = (v: string) => v.replace(/^v/, "");
  const req = normalize(requestedVersion);
  const installed = normalize(VERSION);
  if (req === installed) return false;

  const reqParts = req.split(".").map(Number);
  const instParts = installed.split(".").map(Number);
  for (let i = 0; i < Math.max(reqParts.length, instParts.length); i++) {
    const r = reqParts[i] ?? 0;
    const inst = instParts[i] ?? 0;
    if (r > inst) return true;
    if (r < inst) return false;
  }
  return false;
}

async function fetchGithubChangelog(): Promise<string | null> {
  try {
    const res = await fetch(GITHUB_RAW_CHANGELOG_URL);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function setupChangelogTool(pi: ExtensionAPI) {
  pi.registerTool<typeof ChangelogParams, ChangelogDetails>({
    name: "pi_changelog",
    label: "Pi Changelog",
    description:
      "Get changelog entries for Pi. Returns latest version by default, or specify a version. Fetches from GitHub if the requested version is newer than the installed Pi.",

    parameters: ChangelogParams,

    async execute(
      _toolCallId: string,
      params: ChangelogParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        // If a specific version is requested and it's newer than installed,
        // fetch from GitHub directly -- the local changelog won't have it.
        if (params.version && isNewerThanInstalled(params.version)) {
          const githubContent = await fetchGithubChangelog();
          if (!githubContent) {
            return {
              content: [
                {
                  type: "text",
                  text: `Version ${params.version} is newer than installed (${VERSION}) and GitHub fetch failed.`,
                },
              ],
              details: {
                success: false,
                message: `Version ${params.version} is newer than installed (${VERSION}) and GitHub fetch failed.`,
              },
            };
          }

          const parseResult = parseChangelog(githubContent, params.version);
          if (!parseResult.success || !parseResult.changelog) {
            return {
              content: [{ type: "text", text: parseResult.message }],
              details: {
                success: false,
                message: parseResult.message,
                source: "github",
              },
            };
          }

          let message = `${parseResult.message} (from GitHub)`;
          message += `\n\n## ${parseResult.changelog.version}\n\n${parseResult.changelog.content}`;
          if (
            parseResult.changelog.allVersions &&
            parseResult.changelog.allVersions.length > 1
          ) {
            message += `\n\nAll available versions: ${parseResult.changelog.allVersions.join(", ")}`;
          }

          return {
            content: [{ type: "text", text: message }],
            details: {
              success: true,
              message: `${parseResult.message} (from GitHub)`,
              changelog: parseResult.changelog,
              source: "github",
            },
          };
        }

        // Otherwise read from local installation.
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

        const changelogPath = path.join(piPath, "CHANGELOG.md");

        if (!fs.existsSync(changelogPath)) {
          return {
            content: [
              {
                type: "text",
                text: `No CHANGELOG.md found in Pi installation at ${piPath}`,
              },
            ],
            details: {
              success: false,
              message: `No CHANGELOG.md found at ${changelogPath}`,
            },
          };
        }

        const changelogContent = fs.readFileSync(changelogPath, "utf-8");
        const parseResult = parseChangelog(changelogContent, params.version);

        if (!parseResult.success || !parseResult.changelog) {
          return {
            content: [{ type: "text", text: parseResult.message }],
            details: {
              success: false,
              message: parseResult.message,
            },
          };
        }

        const { changelog } = parseResult;
        let message = parseResult.message;
        message += `\n\n## ${changelog.version}\n\n${changelog.content}`;

        if (changelog.allVersions && changelog.allVersions.length > 1) {
          message += `\n\nAll available versions: ${changelog.allVersions.join(", ")}`;
        }

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message: parseResult.message,
            changelog,
            source: "local",
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
      const sourceTag =
        details.source === "github" ? theme.fg("muted", " (github)") : "";
      lines.push(theme.fg("success", details.message) + sourceTag);
      lines.push("");
      lines.push(theme.fg("accent", `Version: ${details.changelog.version}`));
      lines.push("");

      const changelogLines = details.changelog.content.split("\n");
      for (const line of changelogLines) {
        if (line.trim().startsWith("###")) {
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
