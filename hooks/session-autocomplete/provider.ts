/**
 * Session autocomplete provider for `@@<token>` completion.
 */

import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { replaceAutocompletePrefix } from "@harness/completion";
import type { SessionResult } from "@harness/session-store";
import { searchSessions, searchSessionsByName } from "@harness/session-store";
import { formatRelativeTime } from "@harness/utils/formatters";
import { collapseHomePath } from "@harness/utils/path";
import {
  DEBOUNCE_MS,
  FTS_MIN_TOKEN_LEN,
  SESSION_AUTOCOMPLETE_PREFIX,
} from "./types";

export {
  extractSessionToken,
  isInsideCodeSpan,
  type SessionToken,
} from "./tokens";

import { extractSessionToken } from "./tokens";

function delay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);

    function onAbort() {
      clearTimeout(timeout);
      resolve(false);
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createSessionAutocompleteProvider(
  current: AutocompleteProvider,
  cwd: string,
  currentSessionId: string,
): AutocompleteProvider {
  // Debounce: incrementing generation counter. Only the latest call
  // survives the debounce window.
  let generation = 0;

  return {
    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const sessionToken = extractSessionToken(textBeforeCursor);

      if (sessionToken === undefined) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      // Debounce: wait, then check if we're still the latest call.
      const thisGen = ++generation;
      const debounceCompleted = await delay(DEBOUNCE_MS, options.signal);
      if (!debounceCompleted) {
        return null;
      }

      if (thisGen !== generation) {
        return null; // superseded by a newer keystroke
      }

      try {
        const { token, global } = sessionToken;
        const query = token === "" ? "*" : token;
        const searchCwd = global ? undefined : cwd;

        // Use session-name LIKE for recent sessions and short tokens
        // (FTS is ~10s for single chars).
        const useFts = token.length >= FTS_MIN_TOKEN_LEN;
        const results = await (useFts
          ? searchSessions({ query, cwd: searchCwd }, options.signal)
          : searchSessionsByName(token, searchCwd));

        if (options.signal.aborted) {
          return null;
        }

        if (results.length === 0) {
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        }

        const items: AutocompleteItem[] = results.map((r: SessionResult) => {
          const isCurrent = r.id === currentSessionId;
          const name = r.name || "(untitled session)";
          const shortId = r.id.slice(0, 8);
          const modified = r.modified || "";
          const relativeTime = modified ? formatRelativeTime(modified) : "";
          const currentLabel = isCurrent ? " \u30fb" : "";
          const score = r.score ? ` \u00b7 ${r.score.toFixed(2)}` : "";
          const cwdDisplay =
            global && r.cwd ? ` \u00b7 ${collapseHomePath(r.cwd)}` : "";

          return {
            value: `${SESSION_AUTOCOMPLETE_PREFIX}${r.id}`,
            label: relativeTime
              ? `${shortId}${currentLabel} \u00b7 ${relativeTime}${score}`
              : `${shortId}${currentLabel}${score}`,
            description: `${name}${cwdDisplay}`,
          };
        });

        return {
          items,
          prefix: `${sessionToken.prefix}${token}`,
        };
      } catch (_error) {
        void _error;
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
    },

    applyCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItem,
      prefix: string,
    ) {
      if (prefix.startsWith(SESSION_AUTOCOMPLETE_PREFIX)) {
        return replaceAutocompletePrefix(
          lines,
          cursorLine,
          cursorCol,
          prefix,
          item.value,
        );
      }

      return current.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    },

    shouldTriggerFileCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
    ) {
      // Don't trigger file completion when typing `@@` tokens
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      if (extractSessionToken(textBeforeCursor) !== undefined) {
        return false;
      }
      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}
