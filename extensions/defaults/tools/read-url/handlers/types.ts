export interface HandlerData {
  sourceUrl: string;
  title?: string;
  markdown: string;
  statusCode?: number;
  statusText?: string;
}

export interface ReadUrlHandler {
  name: string;
  matches(url: URL): boolean;
  fetchData(url: URL, signal: AbortSignal | undefined): Promise<HandlerData>;
}
