import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { fetchRexSnapshot } from "./rex";
import { extractRexToken, parseRexKind } from "./tokens";
import {
  DEBOUNCE_MS,
  MAX_SUGGESTIONS,
  REX_PREFIX,
  type RexSnapshot,
} from "./types";

interface CompletionEditResult {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

function replaceAutocompletePrefix(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  prefix: string,
  value: string,
): CompletionEditResult {
  const currentLine = lines[cursorLine] ?? "";
  const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
  const afterCursor = currentLine.slice(cursorCol);
  const newLines = [...lines];
  newLines[cursorLine] = `${beforePrefix}${value}${afterCursor}`;
  return {
    lines: newLines,
    cursorLine,
    cursorCol: beforePrefix.length + value.length,
  };
}

interface SelfIds {
  sessionId?: string;
  blockId?: string;
}

function buildItems(
  snapshot: RexSnapshot,
  token: string,
  self: SelfIds,
): AutocompleteItem[] {
  const items: AutocompleteItem[] = [];
  const kind = parseRexKind(token);
  const query = kind ? token.slice(kind.length + 1) : token;
  const lower = query.toLowerCase();
  const matchesToken = (...fields: string[]) =>
    !lower || fields.some((f) => f.toLowerCase().includes(lower));

  if (kind !== "block") {
    for (const session of snapshot.sessions) {
      if (!matchesToken(session.label, session.sessionId)) continue;
      const isCurrent = self.sessionId === session.sessionId;
      items.push({
        value: `${REX_PREFIX}session:${session.sessionId}`,
        label: `${session.label}${isCurrent ? " (you)" : ""}`,
        description: `session · ${session.sessionId}`,
      });
    }
  }

  if (kind !== "session") {
    const sessionOrder = new Map(
      snapshot.sessions.map((s, i) => [s.sessionId, i]),
    );
    const blocks = [...snapshot.blocks].sort((a, b) => {
      const aCurrent = a.blockId === self.blockId ? 2 : a.focused ? 1 : 0;
      const bCurrent = b.blockId === self.blockId ? 2 : b.focused ? 1 : 0;
      if (aCurrent !== bCurrent) return bCurrent - aCurrent;
      return (
        (sessionOrder.get(b.sessionId) ?? 0) -
        (sessionOrder.get(a.sessionId) ?? 0)
      );
    });
    for (const block of blocks) {
      if (
        !matchesToken(
          block.blockLabel,
          block.sessionLabel,
          block.windowLabel,
          block.blockId,
        )
      )
        continue;
      const isCurrent = self.blockId === block.blockId;
      items.push({
        value: `${REX_PREFIX}block:${block.blockId}`,
        label: `${block.sessionLabel} · ${block.blockLabel}${isCurrent ? " (you)" : ""}`,
        description: `block · ${block.sessionLabel} · ${block.windowLabel} · ${block.blockId}`,
      });
    }
  }

  return items.slice(0, MAX_SUGGESTIONS);
}

export function createRexAutocompleteProvider(
  current: AutocompleteProvider,
  pi: ExtensionAPI,
  self: SelfIds,
): AutocompleteProvider {
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
      const token = extractRexToken(textBeforeCursor);

      if (token === undefined) {
        const currentSuggestions = await current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          options,
        );

        const prefixCandidate = extractPrefixCandidate(
          textBeforeCursor,
          REX_PREFIX,
        );
        if (prefixCandidate !== undefined) {
          const prefixItem = {
            value: REX_PREFIX,
            label: REX_PREFIX,
            description: "rex session/block",
          };
          return {
            items: [
              prefixItem,
              ...(currentSuggestions?.items.filter(
                (other) => other.value !== prefixItem.value,
              ) ?? []),
            ],
            prefix: prefixCandidate,
          };
        }

        return currentSuggestions;
      }

      const gen = ++generation;
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
      if (gen !== generation || options.signal.aborted) return null;

      try {
        const snapshot = await fetchRexSnapshot(pi, options.signal);
        if (options.signal.aborted || gen !== generation) return null;

        const items = buildItems(snapshot, token, self);
        if (items.length === 0) {
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        }

        return {
          items,
          prefix: `${REX_PREFIX}${token}`,
        };
      } catch (_error) {
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
      if (REX_PREFIX.startsWith(prefix) && item.value === REX_PREFIX) {
        return replaceAutocompletePrefix(
          lines,
          cursorLine,
          cursorCol,
          prefix,
          REX_PREFIX,
        );
      }

      if (!prefix.startsWith(REX_PREFIX)) {
        return current.applyCompletion(
          lines,
          cursorLine,
          cursorCol,
          item,
          prefix,
        );
      }

      return replaceAutocompletePrefix(
        lines,
        cursorLine,
        cursorCol,
        prefix,
        `${item.value} `,
      );
    },

    shouldTriggerFileCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
    ) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      if (extractRexToken(textBeforeCursor) !== undefined) {
        return false;
      }
      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}

function extractPrefixCandidate(
  textBeforeCursor: string,
  targetPrefix: string,
): string | undefined {
  const match = textBeforeCursor.match(/(^|\s)(@\S*)$/);
  const candidate = match?.[2];
  if (!candidate || !targetPrefix.startsWith(candidate)) return undefined;
  return candidate;
}
