import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type {
  ExtensionAPI,
  FindToolDetails,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const DEFAULT_LIMIT = 1000;

const BLOCKED_PATHS = new Set([
  homedir(),
  "/",
  "/Users",
  "/home",
  "/tmp",
  "/var",
  "/etc",
  "/opt",
  "/usr",
  "/System",
  "/Library",
  "/Applications",
  "/Volumes",
  "/nix",
  "/snap",
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/boot",
  "/sbin",
  "/bin",
]);

export function setupFindTool(pi: ExtensionAPI): void {
  const wrappedSchema = Type.Object({
    pattern: Type.String({
      description: "The pattern to search for (glob or regex)",
    }),
    path: Type.Optional(
      Type.String({
        description: "The directory to search in (defaults to cwd)",
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: `Maximum number of results (defaults to ${DEFAULT_LIMIT})`,
      }),
    ),
  });

  pi.registerTool<typeof wrappedSchema, FindToolDetails>({
    name: "find",
    label: "Find Files",
    description:
      "Find files by name using the `fd` command-line tool. Supports glob patterns and regex. Searches recursively from the specified path.",
    parameters: wrappedSchema,
    // TODO: promptGuidelines not recognized by current pi-coding-agent types
    // promptGuidelines: [
    //   "Use find instead of find or fd in bash for locating files.",
    // ],
    async execute(
      _toolCallId: string,
      params: {
        pattern: string;
        path?: string;
        limit?: number;
      },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: {
        cwd: string;
      },
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: FindToolDetails;
    }> {
      const pattern = params.pattern;
      const searchPath = params.path;
      const limit = params.limit ?? DEFAULT_LIMIT;

      // Handle abort signal
      if (signal?.aborted) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Search was aborted",
            },
          ],
          details: {},
        };
      }

      // Resolve the search path, expanding ~ to home directory
      let resolvedPath = searchPath || ".";
      // Expand ~ to home directory if path starts with ~ (but not ~something else like ~/foo)
      if (resolvedPath === "~" || resolvedPath.startsWith("~/")) {
        resolvedPath = resolvedPath.replace(/^~/, homedir());
      }
      const absoluteSearchPath = resolve(ctx.cwd, resolvedPath);

      // Block searching in overly broad directories
      if (BLOCKED_PATHS.has(absoluteSearchPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Searching '${absoluteSearchPath}' is not allowed — too broad. Narrow the search to a specific project or subdirectory.`,
            },
          ],
          details: {},
        };
      }

      // Check if path exists
      if (!existsSync(absoluteSearchPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Path not found: ${absoluteSearchPath}`,
            },
          ],
          details: {},
        };
      }

      // Build fd arguments - NOTE: We intentionally omit --ignore-file flags
      // because fd natively discovers .gitignore files with correct directory scoping.
      // The native find tool had a bug where nested .gitignore files were passed via
      // --ignore-file, applying patterns globally instead of scoped to each directory.
      const fdArgs = [
        "--glob",
        "--color=never",
        "--hidden",
        "--max-results",
        String(limit),
        pattern,
        absoluteSearchPath,
      ];

      // Run fd command using pi.exec
      const result = await pi.exec("fd", fdArgs, {
        signal: signal ?? undefined,
        cwd: ctx.cwd,
      });

      // Handle abort
      if (result.killed && signal?.aborted) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Search was aborted",
            },
          ],
          details: {},
        };
      }

      // Handle non-zero exit with no stdout
      if (result.code !== 0 && !result.stdout) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error running fd: ${result.stderr || "Unknown error"}`,
            },
          ],
          details: {},
        };
      }

      // Process results - relativize paths to searchPath
      const allResults = result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      // Handle empty results
      if (allResults.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No files found matching the pattern.",
            },
          ],
          details: {
            resultLimitReached: 0,
          },
        };
      }

      const results = allResults.map((absolutePath) => {
        // Make path relative to searchPath
        if (absolutePath.startsWith(absoluteSearchPath)) {
          return absolutePath.slice(absoluteSearchPath.length + 1);
        }
        return absolutePath;
      });

      // Apply the limit
      const truncatedResults = results.slice(0, limit);
      const wasTruncated = results.length > truncatedResults.length;

      let outputText = truncatedResults.join("\n");

      if (wasTruncated) {
        outputText += `\n\n(Showing ${truncatedResults.length} of ${results.length} results. Increase limit to see more.)`;
      }

      const details: FindToolDetails = {
        resultLimitReached: wasTruncated ? results.length : undefined,
      };

      return {
        content: [
          {
            type: "text",
            text: outputText,
          },
        ],
        details,
      };
    },
  });
}
