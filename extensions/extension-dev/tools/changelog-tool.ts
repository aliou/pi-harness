import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { keyHint, VERSION } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { findPiInstallation } from "./utils";

const GITHUB_RAW_CHANGELOG_URL =
  "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/CHANGELOG.md";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

const ChangelogParams = Type.Object({
  version: Type.Optional(
    Type.String({
      description:
        "Specific version to get changelog for. If not provided, returns latest version.",
    }),
  ),
});

type ChangelogParamsType = Static<typeof ChangelogParams>;

const ChangelogVersionsParams = Type.Object({});
type ChangelogVersionsParamsType = Record<string, never>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangelogEntry {
  version: string;
  content: string;
}

interface ChangelogDetails {
  success: boolean;
  message: string;
  changelog?: ChangelogEntry;
  source?: "local" | "github";
}

interface ChangelogVersionsDetails {
  success: boolean;
  message: string;
  versions?: string[];
  source?: "local" | "github";
}

type ExecuteResult = AgentToolResult<ChangelogDetails>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface ParsedChangelog {
  entries: Array<{ version: string; content: string }>;
}

function parseChangelogEntries(changelogContent: string): ParsedChangelog {
  const lines = changelogContent.split("\n");
  const entries: Array<{
    version: string;
    content: string;
    lineStart: number;
    lineEnd: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const versionMatch = line.trim().match(/^#+\s*(?:\[([^\]]+)\]|([^[\s]+))/);
    if (versionMatch) {
      const version = versionMatch[1] || versionMatch[2];
      if (version && /^v?\d+\.\d+/.test(version)) {
        entries.push({ version, content: "", lineStart: i, lineEnd: -1 });
      }
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const nextEntry = entries[i + 1];
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

  return { entries };
}

function findChangelogEntry(
  changelogContent: string,
  requestedVersion?: string,
): {
  success: boolean;
  changelog?: ChangelogEntry;
  message: string;
} {
  try {
    const { entries } = parseChangelogEntries(changelogContent);
    if (entries.length === 0) {
      return { success: false, message: "No version entries found" };
    }

    if (requestedVersion) {
      const normalizedRequested = requestedVersion.replace(/^v/, "");
      const entry = entries.find(
        (e) =>
          e.version === requestedVersion ||
          e.version === `v${normalizedRequested}` ||
          e.version.replace(/^v/, "") === normalizedRequested,
      );

      if (entry) {
        return {
          success: true,
          changelog: { version: entry.version, content: entry.content },
          message: `Found changelog for version ${entry.version}`,
        };
      }

      const allVersions = entries.map((e) => e.version);
      return {
        success: false,
        message: `Version ${requestedVersion} not found. Available: ${allVersions.join(", ")}`,
      };
    }

    const latest = entries[0];
    if (!latest) {
      return { success: false, message: "No version entries found" };
    }
    return {
      success: true,
      changelog: { version: latest.version, content: latest.content },
      message: `Latest changelog entry: ${latest.version}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error parsing changelog: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function readLocalChangelog(): { content: string; piPath: string } | null {
  const piPath = findPiInstallation();
  if (!piPath) return null;
  const changelogPath = path.join(piPath, "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) return null;
  return { content: fs.readFileSync(changelogPath, "utf-8"), piPath };
}

/** Max lines shown when collapsed. */
const COLLAPSED_LINES = 8;

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderChangelogContent(
  content: string,
  theme: Theme,
  maxLines?: number,
): string[] {
  const allLines = content.split("\n");
  const truncated = maxLines != null && allLines.length > maxLines;
  const linesToRender = truncated ? allLines.slice(0, maxLines) : allLines;

  const out: string[] = [];
  for (const line of linesToRender) {
    if (line.trim().startsWith("###")) {
      out.push(theme.fg("warning", line));
    } else if (line.trim().startsWith("##")) {
      out.push(theme.fg("accent", line));
    } else if (line.trim().startsWith("#")) {
      out.push(theme.fg("accent", theme.bold(line)));
    } else if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
      out.push(theme.fg("dim", line));
    } else {
      out.push(line);
    }
  }

  if (truncated) {
    out.push(theme.fg("muted", "..."));
  }

  return out;
}

// ---------------------------------------------------------------------------
// pi_changelog
// ---------------------------------------------------------------------------

export function setupChangelogTool(pi: ExtensionAPI) {
  pi.registerTool<typeof ChangelogParams, ChangelogDetails>({
    name: "pi_changelog",
    label: "Pi Changelog",
    description:
      "Get changelog entry for a Pi version. Returns latest by default. Use pi_changelog_versions to list all available versions.",

    parameters: ChangelogParams,

    async execute(
      _toolCallId: string,
      params: ChangelogParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      try {
        // Newer than installed -> fetch from GitHub
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

          const result = findChangelogEntry(githubContent, params.version);
          if (!result.success || !result.changelog) {
            return {
              content: [{ type: "text", text: result.message }],
              details: {
                success: false,
                message: result.message,
                source: "github",
              },
            };
          }

          const message = `${result.message} (from GitHub)\n\n## ${result.changelog.version}\n\n${result.changelog.content}`;
          return {
            content: [{ type: "text", text: message }],
            details: {
              success: true,
              message: `${result.message} (from GitHub)`,
              changelog: result.changelog,
              source: "github",
            },
          };
        }

        // Local
        const local = readLocalChangelog();
        if (!local) {
          return {
            content: [
              {
                type: "text",
                text: "Could not locate Pi installation or CHANGELOG.md",
              },
            ],
            details: {
              success: false,
              message: "Could not locate Pi installation or CHANGELOG.md",
            },
          };
        }

        const result = findChangelogEntry(local.content, params.version);
        if (!result.success || !result.changelog) {
          return {
            content: [{ type: "text", text: result.message }],
            details: { success: false, message: result.message },
          };
        }

        const { changelog } = result;
        const message = `${result.message}\n\n## ${changelog.version}\n\n${changelog.content}`;
        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message: result.message,
            changelog,
            source: "local",
          },
        };
      } catch (error) {
        const message = `Error reading Pi changelog: ${error instanceof Error ? error.message : String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
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
      options: ToolRenderResultOptions,
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

      const { expanded } = options;
      const lines: string[] = [];

      const sourceTag =
        details.source === "github" ? theme.fg("muted", " (github)") : "";
      lines.push(theme.fg("success", details.message) + sourceTag);
      lines.push("");
      lines.push(theme.fg("accent", `Version: ${details.changelog.version}`));
      lines.push("");

      lines.push(
        ...renderChangelogContent(
          details.changelog.content,
          theme,
          expanded ? undefined : COLLAPSED_LINES,
        ),
      );

      if (!expanded) {
        lines.push("");
        lines.push(theme.fg("muted", `${keyHint("expandTools", "to expand")}`));
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });

  // -------------------------------------------------------------------------
  // pi_changelog_versions
  // -------------------------------------------------------------------------

  pi.registerTool<typeof ChangelogVersionsParams, ChangelogVersionsDetails>({
    name: "pi_changelog_versions",
    label: "Pi Changelog Versions",
    description: "List all available Pi changelog versions",

    parameters: ChangelogVersionsParams,

    async execute(
      _toolCallId: string,
      _params: ChangelogVersionsParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<ChangelogVersionsDetails>> {
      try {
        const local = readLocalChangelog();
        if (!local) {
          return {
            content: [
              {
                type: "text",
                text: "Could not locate Pi installation or CHANGELOG.md",
              },
            ],
            details: {
              success: false,
              message: "Could not locate Pi installation or CHANGELOG.md",
            },
          };
        }

        const { entries } = parseChangelogEntries(local.content);
        if (entries.length === 0) {
          return {
            content: [
              { type: "text", text: "No version entries found in changelog" },
            ],
            details: {
              success: false,
              message: "No version entries found in changelog",
            },
          };
        }

        const versions = entries.map((e) => e.version);
        const message = `${versions.length} versions available:\n${versions.join(", ")}`;

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message: `Found ${versions.length} versions`,
            versions,
            source: "local",
          },
        };
      } catch (error) {
        const message = `Error reading changelog: ${error instanceof Error ? error.message : String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: { success: false, message },
        };
      }
    },

    renderCall(_args: ChangelogVersionsParamsType, theme: Theme): Text {
      return new Text(
        theme.fg("toolTitle", theme.bold("pi_changelog_versions")),
        0,
        0,
      );
    },

    renderResult(
      result: AgentToolResult<ChangelogVersionsDetails>,
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

      if (!details.versions || details.versions.length === 0) {
        return new Text(theme.fg("warning", "No versions found"), 0, 0);
      }

      const lines: string[] = [];
      lines.push(
        theme.fg("accent", `${details.versions.length} versions available:`),
      );
      lines.push("");

      const cols = 6;
      const maxLen = Math.max(...details.versions.map((v) => v.length));
      const colWidth = maxLen + 2;
      for (let i = 0; i < details.versions.length; i += cols) {
        const row = details.versions
          .slice(i, i + cols)
          .map((v) => v.padEnd(colWidth))
          .join("");
        lines.push(theme.fg("dim", row));
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
