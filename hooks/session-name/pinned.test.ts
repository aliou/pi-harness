import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  SESSION_NAME_CHANGE_TYPE,
  type SessionNameChangeCustomEntry,
} from "./constants";
import { isSessionNamePinned } from "./pinned";

let nextId = 0;

function infoEntry(name?: string): SessionEntry {
  return {
    type: "session_info",
    id: `entry-${nextId++}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    name,
  };
}

function changeEntry(name: string): SessionEntry {
  return {
    type: "custom",
    customType: SESSION_NAME_CHANGE_TYPE,
    id: `entry-${nextId++}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: {
      previousName: undefined,
      name,
    } satisfies SessionNameChangeCustomEntry,
  };
}

describe("isSessionNamePinned", () => {
  it("is not pinned when the session was never named", () => {
    expect(isSessionNamePinned([])).toBe(false);
  });

  it("is pinned when the only name came from the user", () => {
    expect(isSessionNamePinned([infoEntry("my name")])).toBe(true);
  });

  it("is not pinned when the name matches the subagent's change entry", () => {
    expect(isSessionNamePinned([infoEntry("auto"), changeEntry("auto")])).toBe(
      false,
    );
  });

  it("is pinned when the user renamed after an auto name", () => {
    const entries = [
      infoEntry("auto"),
      changeEntry("auto"),
      infoEntry("user name"),
    ];
    expect(isSessionNamePinned(entries)).toBe(true);
  });

  it("is not pinned after a refine following an untouched auto name", () => {
    const entries = [
      infoEntry("auto"),
      changeEntry("auto"),
      infoEntry("refined"),
      changeEntry("refined"),
    ];
    expect(isSessionNamePinned(entries)).toBe(false);
  });

  it("is pinned when the user renamed more than once after an auto name", () => {
    const entries = [
      infoEntry("auto"),
      changeEntry("auto"),
      infoEntry("user name"),
      infoEntry("other"),
    ];
    expect(isSessionNamePinned(entries)).toBe(true);
  });

  it("is not pinned when the name was cleared", () => {
    const entries = [infoEntry("user name"), infoEntry("")];
    expect(isSessionNamePinned(entries)).toBe(false);
  });

  it("is pinned when the user reuses the exact auto name (accepted edge case)", () => {
    const entries = [infoEntry("auto"), changeEntry("auto"), infoEntry("auto")];
    expect(isSessionNamePinned(entries)).toBe(false);
  });
});
