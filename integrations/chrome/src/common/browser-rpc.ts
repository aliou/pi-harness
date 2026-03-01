export const BROWSER_RPC_METHODS = [
  "tabs.list",
  "tabs.get",
  "tabs.current",
  "tabs.create",
  "tabs.activate",
  "tabs.close",
  "tabs.update",
  "tabs.go_back",
  "tabs.go_forward",
  "tabs.reload",
  "page.click",
  "page.type",
  "page.scroll",
  "page.key",
  "page.hover",
  "page.form_input",
  "page.get_text",
  "page.read",
  "page.find",
  "page.screenshot",
  "debug.read_console_messages",
  "debug.read_network_requests",
  "debug.export_network_requests",
  "sessions.list",
  "sessions.switch",
] as const;

export type BrowserRpcMethod = (typeof BROWSER_RPC_METHODS)[number];

export interface BrowserRequest {
  type: "browser_request";
  id: string;
  method: BrowserRpcMethod;
  params: Record<string, unknown>;
}

export interface BrowserResponse {
  type: "browser_response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
