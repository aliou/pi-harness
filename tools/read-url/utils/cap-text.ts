/** Size limit of text returned in `structuredContent`, like pi's bash tool. */
export const STRUCTURED_TEXT_MAX_BYTES = 1024 * 1024;

export interface CappedText {
  text: string;
  truncated: boolean;
}

/**
 * Limit `text` to `maxBytes` UTF-8 bytes. Longer text keeps its first and last
 * `maxBytes / 2` bytes around an omission marker, cut at character boundaries.
 */
export function capText(
  text: string,
  maxBytes = STRUCTURED_TEXT_MAX_BYTES,
): CappedText {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }

  const bytes = Buffer.from(text, "utf8");
  const headBytes = Math.floor(maxBytes / 2);
  // Streaming decode holds back an incomplete trailing sequence.
  const head = new TextDecoder().decode(bytes.subarray(0, headBytes), {
    stream: true,
  });
  const tailStart = skipContinuationBytes(
    bytes,
    bytes.length - (maxBytes - headBytes),
  );
  const tail = new TextDecoder().decode(bytes.subarray(tailStart));
  const omitted = tailStart - headBytes;
  return {
    text: `${head}\n\n[... ${omitted} bytes omitted ...]\n\n${tail}`,
    truncated: true,
  };
}

function skipContinuationBytes(bytes: Uint8Array, start: number): number {
  let index = start;
  while (index < bytes.length && ((bytes[index] ?? 0) & 0xc0) === 0x80) {
    index++;
  }
  return index;
}
