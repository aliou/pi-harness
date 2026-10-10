/** Prefix for zoxide autocomplete. */
export const PROJECT_PREFIX = "@z:";

/** Match `@z:` plus an optional token at end of text before cursor. */
export const PROJECT_TOKEN_RE = /@z:([^\s@]*)$/;

/** Maximum project suggestions shown for `@z:` completion. */
export const MAX_PROJECT_SUGGESTIONS = 20;
