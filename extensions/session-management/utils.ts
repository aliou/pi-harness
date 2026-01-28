/**
 * Copy text to clipboard using OSC 52 escape sequence.
 * Works across terminals (iTerm2, Kitty, Alacritty, WezTerm, Ghostty, etc.)
 * and over SSH (copies to local clipboard).
 */
export function copyToClipboard(text: string): void {
  const base64 = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${base64}\x07`);
}
