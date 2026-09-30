import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

export const ReadUrlParams = Type.Object({
  url: Type.String({
    description: "URL to fetch as Markdown via markdown.new",
  }),
});

export type ReadUrlParamsType = Static<typeof ReadUrlParams>;

export interface NativeReadTool {
  execute(
    toolCallId: string,
    params: { path: string; offset?: number; limit?: number },
    signal?: AbortSignal,
    onUpdate?: unknown,
  ): Promise<AgentToolResult<unknown>>;
}

export type ReadContentBlock = ExecuteResult["content"][number];

export type FetchLike = typeof fetch;

export interface ReadUrlDetails {
  url: string;
  sourceUrl: string;
  title?: string;
  handler: string;
  statusCode?: number;
  statusText?: string;
  failed: boolean;
  imageCount?: number;
  attachedImageCount?: number;
  skippedImageCount?: number;
  tempFilePath?: string;
  totalLines?: number;
}

export type ExecuteResult = AgentToolResult<ReadUrlDetails>;

/**
 * `structuredContent` of `read_url`. `markdown` is the fetched text, not the
 * model-facing preview. Images reach the model only.
 */
export const ReadUrlOutputSchema = Type.Object({
  url: Type.String(),
  sourceUrl: Type.String({ description: "URL the handler fetched" }),
  title: Type.Optional(Type.String()),
  handler: Type.String({ description: "Handler that fetched the URL" }),
  statusCode: Type.Optional(Type.Number()),
  statusText: Type.Optional(Type.String()),
  markdown: Type.String({
    description:
      "Fetched Markdown, up to 1 MiB. Longer text keeps its first and last 512 KiB around an omission marker.",
  }),
  truncated: Type.Boolean({
    description: "Whether `markdown` omits part of the fetched text",
  }),
  tempFilePath: Type.Optional(
    Type.String({
      description: "Temp file with the full Markdown, when truncated",
    }),
  ),
  totalLines: Type.Number({ description: "Line count of the full Markdown" }),
  imageCount: Type.Number(),
  attachedImageCount: Type.Number({
    description: "Images attached to the model-facing content",
  }),
  skippedImageCount: Type.Number(),
});

export type ReadUrlOutput = Static<typeof ReadUrlOutputSchema>;

export const COLLAPSED_PREVIEW_LINES = 8;
