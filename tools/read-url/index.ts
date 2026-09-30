import type {
  AgentToolResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createReadTool, defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { executeReadUrlRequest } from "./fetch";
import {
  createGistHandler,
  createGitHubHandler,
  createMarkdownNewHandler,
  createNpmHandler,
  createTailscaleHandler,
  createTwitterHandler,
  type ReadUrlHandler,
} from "./handlers";
import { renderCall, renderResult } from "./render";
import { type ReadUrlDetails, ReadUrlOutputSchema } from "./types";

const ReadUrlParams = Type.Object({
  url: Type.String({
    description: "URL to fetch as Markdown via markdown.new",
  }),
});

function createReadUrlTool(_pi: ExtensionAPI) {
  const handlers: ReadUrlHandler[] = [
    createTwitterHandler(),
    createGitHubHandler(),
    createGistHandler(),
    createNpmHandler(),
    createTailscaleHandler(),
    createMarkdownNewHandler(),
  ];
  const nativeRead = createReadTool(process.cwd());

  return defineTool({
    name: "read_url",
    label: "Read URL",
    description:
      "Fetch a URL as Markdown via handlers with markdown.new fallback.",
    promptSnippet: "Fetch a URL as Markdown (docs, articles, web content)",
    parameters: ReadUrlParams,
    outputSchema: ReadUrlOutputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
    promptGuidelines: [
      "read_url: Use for finding documentation, articles, recent information, or any web content.",
      "read_url: Write specific queries with names, dates, versions, or locations for best results.",
      "read_url: Results are fresh and not cached.",
    ],

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      return executeReadUrlRequest(
        params.url,
        signal,
        handlers,
        nativeRead,
        fetch,
      );
    },

    renderCall(args, theme) {
      return renderCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderResult(
        result as AgentToolResult<ReadUrlDetails>,
        options,
        theme,
      );
    },
  });
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool(createReadUrlTool(pi));
}
