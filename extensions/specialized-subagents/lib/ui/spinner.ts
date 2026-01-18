/** Braille spinner frames */
export const SPINNER_FRAMES: readonly string[] = [
  "⣋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
];

/** Status indicators */
export const INDICATOR = {
  done: "✓",
  error: "✗",
  pending: "○",
} as const;

/** Get spinner frame for animation */
export function getSpinnerFrame(frameIndex: number): string {
  return SPINNER_FRAMES[Math.abs(frameIndex) % SPINNER_FRAMES.length] ?? "•";
}
