import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { expandHomePath } from "@harness/utils";
import { Type } from "typebox";
import { BLOCKED_PATHS } from "./blocked-paths";
import { buildFindOutput } from "./helpers";
import { renderCall } from "./render";
import { FindOutputSchema, type HarnessFindDetails } from "./types";

const DEFAULT_LIMIT = 1000;

const WrappedSchema = Type.Object({
  pattern: Type.String({
    description: "The pattern to search for (glob)",
  }),
  path: Type.Optional(
    Type.String({
      description: "The directory to search in (defaults to cwd)",
    }),
  ),
  noIgnore: Type.Optional(
    Type.Boolean({
      description:
        "Include files ignored by .gitignore / .ignore / .fdignore (default: false)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: `Maximum number of results (defaults to ${DEFAULT_LIMIT})`,
    }),
  ),
});

// fd --glob matches patterns against the file basename by default. When a user
// passes a glob with a literal directory prefix such as src/**/*.ts, we need
// to run fd inside that prefix directory with the remaining file pattern so the
// directory part is actually honored.
function splitGlobPattern(pattern: string): {
  baseDir: string | undefined;
  filePattern: string;
} {
  const metaChars = new Set(["*", "?", "{", "}", "[", "]"]);
  let firstMeta = -1;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char && metaChars.has(char)) {
      firstMeta = i;
      break;
    }
  }

  if (firstMeta <= 0) {
    return { baseDir: undefined, filePattern: pattern };
  }

  const slashIndex = pattern.lastIndexOf("/", firstMeta - 1);
  if (slashIndex <= 0) {
    return { baseDir: undefined, filePattern: pattern };
  }

  const baseDir = pattern.slice(0, slashIndex);
  const filePattern = pattern.slice(slashIndex + 1);

  if (baseDir === "**" || baseDir === "*") {
    return { baseDir: undefined, filePattern: pattern };
  }

  return { baseDir, filePattern };
}

function createFindTool(pi: ExtensionAPI) {
  return defineTool({
    name: "find",
    label: "Find Files",
    description: `Find files by name using the \`fd\` command-line tool. Supports glob patterns. Searches recursively from the specified path. Respects .gitignore unless noIgnore is set. Results are truncated to ${DEFAULT_LIMIT} entries.`,
    promptSnippet: "Find files by glob pattern (respects .gitignore)",
    parameters: WrappedSchema,
    outputSchema: FindOutputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
    promptGuidelines: [
      "find: Use find instead of shell find or fd when locating files in the project.",
      "find: Prefer passing path explicitly instead of scanning broad roots.",
      "find: Use noIgnore=true when the target files are ignored by .gitignore.",
    ],
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const pattern = params.pattern;
      const searchPath = params.path;
      const limit = params.limit ?? DEFAULT_LIMIT;

      if (signal?.aborted) {
        throw new Error("Search was aborted");
      }

      const resolvedPath = expandHomePath(searchPath || ".");
      const absoluteSearchPath = resolve(ctx.cwd, resolvedPath);
      const relativeTo =
        searchPath && searchPath !== "." && searchPath !== "./"
          ? relative(ctx.cwd, absoluteSearchPath) || "."
          : undefined;

      if (BLOCKED_PATHS.has(absoluteSearchPath)) {
        throw new Error(
          `Searching '${absoluteSearchPath}' is not allowed — too broad. Narrow the search to a specific project or subdirectory.`,
        );
      }

      if (!existsSync(absoluteSearchPath)) {
        throw new Error(`Path not found: ${absoluteSearchPath}`);
      }

      const { baseDir, filePattern } = splitGlobPattern(pattern);
      const effectiveSearchPath = baseDir
        ? resolve(absoluteSearchPath, baseDir)
        : absoluteSearchPath;

      if (BLOCKED_PATHS.has(effectiveSearchPath)) {
        throw new Error(
          `Searching '${effectiveSearchPath}' is not allowed — too broad. Narrow the search to a specific project or subdirectory.`,
        );
      }

      if (!existsSync(effectiveSearchPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No files found matching the pattern.",
            },
          ],
          details: {},
          structuredContent: buildFindOutput(
            absoluteSearchPath,
            [],
            limit,
            relativeTo,
          ),
        };
      }

      const fdArgs = [
        "--glob",
        "--color=never",
        "--hidden",
        ...(params.noIgnore ? ["--no-ignore"] : []),
        "--max-results",
        String(limit),
        filePattern,
        effectiveSearchPath,
      ];

      const result = await pi.exec("fd", fdArgs, {
        signal: signal ?? undefined,
        cwd: ctx.cwd,
      });

      if (result.killed && signal?.aborted) {
        throw new Error("Search was aborted");
      }

      if (result.code !== 0 && !result.stdout) {
        throw new Error(result.stderr || "Unknown error");
      }

      const allResults = result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      if (allResults.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No files found matching the pattern.",
            },
          ],
          details: {},
          structuredContent: buildFindOutput(
            absoluteSearchPath,
            [],
            limit,
            relativeTo,
          ),
        };
      }

      const results = allResults.map((absolutePath) => {
        if (absolutePath.startsWith(absoluteSearchPath)) {
          return absolutePath.slice(absoluteSearchPath.length + 1);
        }
        return absolutePath;
      });

      const wasTruncated = results.length >= limit;

      const details: HarnessFindDetails = {
        resultLimitReached: wasTruncated ? results.length : undefined,
        totalResults: results.length,
        paths: results,
        relativeTo,
      };

      const outputText = results.join("\n");

      return {
        content: [{ type: "text", text: outputText }],
        details,
        structuredContent: buildFindOutput(
          absoluteSearchPath,
          results,
          limit,
          relativeTo,
        ),
      };
    },

    renderCall(args, theme) {
      return renderCall(args, theme);
    },
  });
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool(createFindTool(pi));
}
