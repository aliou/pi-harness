import type { HandlerData, ReadUrlHandler } from "./types";

export function createMarkdownNewHandler(): ReadUrlHandler {
  return {
    name: "markdown.new",
    matches: () => true,
    async fetchData(
      url: URL,
      signal: AbortSignal | undefined,
    ): Promise<HandlerData> {
      const markdownUrl = `https://markdown.new/${url.toString()}`;
      const response = await fetch(markdownUrl, { signal });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText || "Error"}${body ? ` - ${body}` : ""}`,
        );
      }

      const parsed = parseMarkdownNewResponse(body, url.toString());
      return {
        sourceUrl: parsed.sourceUrl,
        title: parsed.title,
        markdown: parsed.markdown,
        statusCode: response.status,
        statusText: response.statusText,
      };
    },
  };
}

function parseMarkdownNewResponse(
  raw: string,
  originalUrl: string,
): { title?: string; sourceUrl: string; markdown: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const titleLine = lines.find((line) => line.startsWith("Title:"));
  const sourceLine = lines.find((line) => line.startsWith("URL Source:"));
  const markerIndex = lines.findIndex(
    (line) => line.trim() === "Markdown Content:",
  );

  const title = titleLine?.replace(/^Title:\s*/, "").trim() || undefined;
  const sourceUrl =
    sourceLine?.replace(/^URL Source:\s*/, "").trim() || originalUrl;

  const markdown =
    markerIndex >= 0
      ? lines
          .slice(markerIndex + 1)
          .join("\n")
          .replace(/^\n+/, "")
          .trimEnd()
      : normalized.trimEnd();

  return {
    title,
    sourceUrl,
    markdown,
  };
}
