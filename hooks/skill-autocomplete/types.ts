/** Trigger character for skill autocomplete. */
export const SKILL_TRIGGER = "?";

/** Match `?<token>`, `??<token>`, or `???<token>` at a token boundary. */
export const SKILL_TOKEN_RE = /(?:^|\s)(\?{1,3})([^\s?]*)$/;

/**
 * Match a `?` that was typed at a token boundary but is followed by a space.
 * This means the skill trigger was consumed and the user moved on —
 * completion should bail out rather than fall through to the default provider.
 */
export const SKILL_TRIGGER_CONSUMED_RE = /(?:^|\s)\?\s$/;
