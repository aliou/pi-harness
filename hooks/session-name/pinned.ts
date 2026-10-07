import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  SESSION_NAME_CHANGE_TYPE,
  type SessionNameChangeCustomEntry,
} from "./constants";

/**
 * True when the current session name was set by the user (or anything other
 * than the naming subagent). Session entries carry no provenance, so the pin
 * is derived by comparing the newest `session_info` entry against the newest
 * `session_name_change` custom entry, which only the subagent's `set_name`
 * tool writes. A cleared name is not pinned. Sessions named before the
 * change-entry existed have no matching entry and read as pinned.
 */
export function isSessionNamePinned(entries: SessionEntry[]): boolean {
  // null = not seen yet; "" = seen but cleared.
  let currentName: string | null = null;
  let autoName: string | null = null;

  for (
    let i = entries.length - 1;
    i >= 0 && (currentName === null || autoName === null);
    i--
  ) {
    const entry = entries[i];
    if (!entry) continue;
    if (currentName === null && entry.type === "session_info") {
      currentName = entry.name?.trim() ?? "";
      continue;
    }
    if (
      autoName === null &&
      entry.type === "custom" &&
      entry.customType === SESSION_NAME_CHANGE_TYPE
    ) {
      const data = entry.data as SessionNameChangeCustomEntry | undefined;
      autoName = data?.name ?? "";
    }
  }

  if (currentName === null || currentName === "") return false;
  return currentName !== autoName;
}
