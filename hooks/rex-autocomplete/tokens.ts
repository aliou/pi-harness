const REX_TOKEN_RE = /(^|\s)(@rex:)([^\s`"]*)$/;

export function extractRexToken(textBeforeCursor: string): string | undefined {
  if (isInsideCodeSpan(textBeforeCursor)) return undefined;
  const match = textBeforeCursor.match(REX_TOKEN_RE);
  return match ? (match[3] ?? "") : undefined;
}

export function parseRexKind(token: string): "session" | "block" | undefined {
  if (token.startsWith("session:")) return "session";
  if (token.startsWith("block:")) return "block";
  return undefined;
}

function isInsideCodeSpan(text: string): boolean {
  const withoutSpans = text.replace(/`{1,3}[^`]*`{1,3}/g, "");
  return (withoutSpans.match(/`/g) ?? []).length % 2 === 1;
}
