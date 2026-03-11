/**
 * Semantic search tool using the codemogger SDK.
 *
 * Uses tree-sitter chunking + local embeddings for semantic code search.
 * Replaces ast-grep with meaning-based search instead of structural patterns.
 *
 * @see https://github.com/glommer/codemogger
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  CodeIndex,
  projectDbPath,
  type Embedder,
  type SearchResult,
  type SearchMode,
} from "codemogger";

const DEFAULT_MAX_RESULTS = 10;
const MAX_SNIPPET_LENGTH = 200;

const parameters = Type.Object({
  query: Type.String({
    description:
      "Natural language query describing what you're looking for. More descriptive = better results. Example: 'where does the server validate JWT tokens'",
  }),
  mode: Type.Optional(
    Type.Union(
      [
        Type.Literal("semantic"),
        Type.Literal("keyword"),
        Type.Literal("hybrid"),
      ],
      {
        description:
          "Search mode: 'semantic' (natural language, default), 'keyword' (exact identifiers), or 'hybrid' (both combined)",
        default: "semantic",
      },
    ),
  ),
  maxResults: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return (default: 10)",
      default: DEFAULT_MAX_RESULTS,
    }),
  ),
});

type CodemoggerSearchParams = {
  query: string;
  mode?: SearchMode;
  maxResults?: number;
};

// ---------------------------------------------------------------------------
// Local embedder resolution
// ---------------------------------------------------------------------------

let cachedEmbedder: Embedder | null = null;
let cachedModelName: string | null = null;

/**
 * Lazily resolve the local embedder bundled with codemogger.
 *
 * The codemogger package doesn't re-export localEmbed from its main entry
 * point, so we dynamically import it from the compiled dist directory.
 */
async function getLocalEmbedder(): Promise<{
  embedder: Embedder;
  modelName: string;
}> {
  if (cachedEmbedder && cachedModelName) {
    return { embedder: cachedEmbedder, modelName: cachedModelName };
  }

  // Resolve codemogger's install location from its main entry point
  const mainEntry = require.resolve("codemogger");
  const distDir = path.dirname(mainEntry);
  const localEmbedPath = path.join(distDir, "embed", "local.js");

  // Dynamic import using file:// URL to bypass package exports restriction
  const mod = await import(pathToFileURL(localEmbedPath).href);

  cachedEmbedder = mod.localEmbed as Embedder;
  cachedModelName = (mod.LOCAL_MODEL_NAME as string) ?? "all-MiniLM-L6-v2";

  return { embedder: cachedEmbedder, modelName: cachedModelName };
}

// ---------------------------------------------------------------------------
// CodeIndex lifecycle
// ---------------------------------------------------------------------------

/** Shared index instances keyed by cwd to avoid reopening across calls. */
const indexCache = new Map<string, CodeIndex>();

async function getIndex(cwd: string): Promise<CodeIndex> {
  const existing = indexCache.get(cwd);
  if (existing) return existing;

  const { embedder, modelName } = await getLocalEmbedder();
  const dbPath = projectDbPath(cwd);
  const index = new CodeIndex({ dbPath, embedder, embeddingModel: modelName });
  indexCache.set(cwd, index);
  return index;
}

function needsIndexing(cwd: string): boolean {
  const dbPath = path.join(cwd, ".codemogger", "index.db");
  return !fs.existsSync(dbPath);
}

function needsReindexing(cwd: string): boolean {
  const dbPath = path.join(cwd, ".codemogger", "index.db");
  if (!fs.existsSync(dbPath)) return false;

  try {
    const stats = fs.statSync(dbPath);
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return stats.mtimeMs < threeDaysAgo;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatResult(result: SearchResult, cwd: string): string {
  const filePath = result.filePath.startsWith(cwd)
    ? result.filePath.slice(cwd.length + 1)
    : result.filePath;

  const lineRange =
    result.endLine > result.startLine
      ? `L${result.startLine}-L${result.endLine}`
      : `L${result.startLine}`;

  const parts: string[] = [];
  parts.push(`${filePath}:${lineRange} [${result.kind}] ${result.name}`);

  if (result.signature && result.signature !== result.name) {
    parts.push(`  ${truncate(result.signature)}`);
  }
  if (result.snippet) {
    parts.push(`  ${truncate(result.snippet)}`);
  }
  parts.push(`  score: ${result.score.toFixed(3)}`);

  return parts.join("\n");
}

function truncate(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_SNIPPET_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_SNIPPET_LENGTH - 3)}...`;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export function createCodemoggerSearchTool(
  cwd: string,
): ToolDefinition<typeof parameters, { indexing: boolean } | undefined> {
  return {
    name: "semantic_search",
    label: "Semantic Search",
    description: `Semantic code search powered by codemogger - finds code by meaning, not just string matching.

Query with natural language questions, not single keywords. More descriptive = better results.
- Good: "where does the server validate JWT tokens"
- Bad: "auth" or "JWT"

Search modes:
- semantic (default): natural language understanding via embeddings
- keyword: fast exact identifier lookup via full-text search
- hybrid: combines both for best results

Returns file paths, line ranges, symbol kinds (function, class, struct, etc.), signatures, and relevance scores.`,
    parameters,

    async execute(_toolCallId, args, signal, onUpdate, _ctx) {
      const {
        query,
        mode = "semantic",
        maxResults = DEFAULT_MAX_RESULTS,
      } = args as CodemoggerSearchParams;

      try {
        const index = await getIndex(cwd);

        // Index if needed
        const stale = needsReindexing(cwd);
        const fresh = needsIndexing(cwd);

        if (fresh || stale) {
          const message = stale
            ? "Index stale (>3 days), re-indexing..."
            : "Indexing repository for semantic search...";

          onUpdate?.({
            content: [{ type: "text", text: message }],
            details: { indexing: true },
          });

          await index.index(cwd, {
            onProgress: (progress) => {
              if (signal?.aborted) return;
              onUpdate?.({
                content: [
                  {
                    type: "text",
                    text: `${progress.phase}: ${progress.current}/${progress.total || "?"}`,
                  },
                ],
                details: { indexing: true },
              });
            },
          });

          onUpdate?.({
            content: [{ type: "text", text: "" }],
            details: { indexing: false },
          });
        }

        if (signal?.aborted) {
          return {
            content: [{ type: "text" as const, text: "Aborted" }],
            details: undefined,
          };
        }

        // Search
        const results = await index.search(query, {
          limit: maxResults,
          includeSnippet: true,
          mode,
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No results found." }],
            details: undefined,
          };
        }

        const output = results.map((r) => formatResult(r, cwd)).join("\n\n");
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
