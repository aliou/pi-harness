/**
 * Semantic search tool wrapping osgrep CLI.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Progress information during osgrep indexing.
 */
interface IndexingProgress {
  status: "starting" | "indexing" | "complete";
  filesProcessed?: number;
  totalFiles?: number;
  currentFile?: string;
}

const parameters = Type.Object({
  query: Type.String({
    description:
      "Natural language question describing what you're looking for. More words = better results. Example: 'where does the server validate JWT tokens'",
  }),
  maxResults: Type.Optional(
    Type.Number({
      description: "Maximum results to return (default: 10)",
      default: 10,
    }),
  ),
});

type SemanticSearchParams = {
  query: string;
  maxResults?: number;
};

/**
 * Check if the repository needs indexing by looking for .osgrep directory.
 */
function needsIndexing(cwd: string): boolean {
  const osgrepDir = path.join(cwd, ".osgrep");
  if (!fs.existsSync(osgrepDir)) {
    return true;
  }
  // Check if directory has actual data (not just empty)
  const contents = fs.readdirSync(osgrepDir);
  return contents.length === 0;
}

/**
 * Check if index is stale (not modified in 3 days) and needs full reset.
 * Checks the lancedb _versions directory which always gets touched during indexing.
 */
function needsResetIndexing(cwd: string): boolean {
  const versionsDir = path.join(
    cwd,
    ".osgrep",
    "lancedb",
    "chunks.lance",
    "_versions",
  );
  if (!fs.existsSync(versionsDir)) {
    return false; // doesn't exist, not stale
  }

  try {
    const stats = fs.statSync(versionsDir);
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return stats.mtimeMs < threeDaysAgo;
  } catch {
    return false;
  }
}

/**
 * Parse osgrep stderr output to extract indexing progress.
 */
function parseIndexingProgress(text: string): IndexingProgress | null {
  // Progress with verbose: "- Indexing files (N files) • filename"
  // Check this FIRST - more specific than generic "- Indexing"
  const progressMatch = text.match(/- Indexing files \((\d+) files\) • (.+)/);
  if (progressMatch?.[1] && progressMatch[2]) {
    return {
      status: "indexing",
      filesProcessed: parseInt(progressMatch[1], 10),
      currentFile: progressMatch[2].trim(),
    };
  }

  // Starting: "- Indexing..." (generic, check after specific patterns)
  if (/^- Indexing/.test(text)) {
    return { status: "starting" };
  }

  // Complete: "✔ Indexing complete(N / M) • indexed N"
  const completeMatch = text.match(/Indexing complete\((\d+)\s*\/\s*(\d+)\)/);
  if (completeMatch?.[1] && completeMatch[2]) {
    return {
      status: "complete",
      filesProcessed: parseInt(completeMatch[1], 10),
      totalFiles: parseInt(completeMatch[2], 10),
    };
  }

  // Alternative complete format: "✔ Initial indexing complete (N/M)"
  const altCompleteMatch = text.match(
    /Initial indexing complete \((\d+)\/(\d+)\)/,
  );
  if (altCompleteMatch?.[1] && altCompleteMatch[2]) {
    return {
      status: "complete",
      filesProcessed: parseInt(altCompleteMatch[1], 10),
      totalFiles: parseInt(altCompleteMatch[2], 10),
    };
  }

  return null;
}

/**
 * Run osgrep index command asynchronously with progress streaming.
 */
async function runOsgrepIndex(
  cwd: string,
  onProgress: (progress: IndexingProgress) => void,
  signal?: AbortSignal,
  reset?: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["index", "--verbose"];
    if (reset) {
      args.push("--reset");
    }
    const child = spawn("osgrep", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Handle abort
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
          reject(new Error("Indexing aborted"));
        },
        { once: true },
      );
    }

    // Buffer stderr to handle line-split chunks
    let stderrBuffer = "";
    child.stderr.on("data", (data: Buffer) => {
      stderrBuffer += data.toString();
      // Process complete lines
      const lines = stderrBuffer.split("\n");
      // Keep incomplete line in buffer
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const progress = parseIndexingProgress(line);
        if (progress) {
          onProgress(progress);
        }
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`osgrep index exited with code ${code}`));
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "osgrep is not installed. Install with: npm install -g osgrep",
          ),
        );
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Run osgrep search command asynchronously.
 */
async function runOsgrepSearch(
  cwd: string,
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "osgrep",
      [query, "-m", String(maxResults), "--plain", "--sync"],
      {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
          reject(new Error("Search aborted"));
        },
        { once: true },
      );
    }

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || "No results found.");
      } else {
        reject(new Error(stderr || `osgrep exited with code ${code}`));
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "osgrep is not installed. Install with: npm install -g osgrep",
          ),
        );
      } else {
        reject(err);
      }
    });
  });
}

export function createSemanticSearchTool(
  cwd: string,
): ToolDefinition<typeof parameters, undefined> {
  return {
    name: "semantic_search",
    label: "Semantic Search",
    description: `Semantic code search - finds code by meaning, not just string matching.

Query with natural language questions, not keywords. More words = better results.
- Good: "where does the server validate JWT tokens"
- Bad: "auth" or "JWT"

Returns file paths, line ranges, roles (ORCHESTRATION = logic, DEFINITION = types), and relevance scores.`,
    parameters,

    async execute(_toolCallId, args, onUpdate, _ctx, signal) {
      const { query, maxResults = 10 } = args as SemanticSearchParams;

      try {
        // Check if index is stale (>3 days old) and needs full reset
        const needsReset = needsResetIndexing(cwd);
        const needsInit = needsIndexing(cwd);

        if (needsInit || needsReset) {
          // Update UI to show indexing status
          const message = needsReset
            ? "Index stale (>3 days), re-indexing from scratch..."
            : "Indexing repository...";
          onUpdate?.({
            content: [{ type: "text", text: message }],
            details: undefined,
          });

          // Run indexing with progress streaming
          await runOsgrepIndex(
            cwd,
            (progress) => {
              const progressMessage =
                progress.status === "complete"
                  ? `Indexing complete (${progress.filesProcessed} files)`
                  : progress.currentFile
                    ? `Indexing (${progress.filesProcessed} files): ${progress.currentFile}`
                    : "Indexing...";

              onUpdate?.({
                content: [{ type: "text", text: progressMessage }],
                details: undefined,
              });
            },
            signal,
            needsReset,
          );
        }

        // Run the actual search
        const output = await runOsgrepSearch(cwd, query, maxResults, signal);

        return {
          content: [{ type: "text" as const, text: output }],
          details: undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  };
}
