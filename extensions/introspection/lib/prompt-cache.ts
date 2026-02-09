/**
 * Caches the base system prompt (captured before extensions modify it)
 * so we can diff it later to identify extension-injected guidance.
 */
let basePrompt: string | undefined;

export function cacheBasePrompt(prompt: string): void {
  if (basePrompt === undefined) {
    basePrompt = prompt;
  }
}

export function getBasePrompt(): string | undefined {
  return basePrompt;
}

export function resetBasePrompt(): void {
  basePrompt = undefined;
}
