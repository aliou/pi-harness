import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  type FindToolDetails,
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

      // Resolve the search path relative to the context's working directory
      const absoluteSearchPath = resolve(ctx.cwd, searchPath || ".");

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

      // Run fd command
      const result = spawnSync("fd", fdArgs, {
        encoding: "utf-8",
        maxBuffer: DEFAULT_MAX_BYTES,
        signal: signal as unknown as AbortSignal,
      });

      // Handle fd not found in PATH
      if (result.error) {
        const errorMessage = result.error.message || "";
        if (
          errorMessage.includes("ENOENT") ||
          errorMessage.includes("not found")
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: 'fd' command not found. Please install fd and ensure it's in your PATH.",
              },
            ],
            details: {},
          };
        }
        // Handle other fd errors
        return {
          content: [
            {
              type: "text" as const,
              text: `Error running fd: ${errorMessage}`,
            },
          ],
          details: {},
        };
      }

      // Handle non-zero exit status
      if (result.status !== 0) {
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

      // No results found
      if (!result.stdout.trim()) {
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

      // Process results - relativize paths to searchPath
      const allResults = result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());

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
