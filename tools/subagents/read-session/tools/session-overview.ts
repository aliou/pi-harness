import { defineTool, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  compactEntry,
  createSessionViewFromSession,
  flattenTree,
} from "@harness/session-tools";
import { Type } from "typebox";
import { getTargetSessionPath } from "./utils";

const SESSION_LINK_MARKER_TYPE = "session-link-marker";
const SESSION_LINK_SOURCE_TYPE = "session-link-source";

type SessionLinkDetails = {
  targetSessionFile?: string;
  parentSessionFile?: string;
};

const getSessionLinkDetails = (
  entry: unknown,
  customType: string,
): SessionLinkDetails | undefined => {
  if (!entry || typeof entry !== "object") return undefined;
  const candidate = entry as {
    type?: string;
    customType?: string;
    details?: unknown;
  };

  if (candidate.type !== "custom_message") return undefined;
  if (candidate.customType !== customType) return undefined;
  if (!candidate.details || typeof candidate.details !== "object") {
    return undefined;
  }

  return candidate.details as SessionLinkDetails;
};

const uniqueStrings = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((value): value is string => !!value)),
];

export const sessionOverview = defineTool({
  name: "get_session_overview",
  label: "Get Session Overview",
  description:
    "Get compact metadata for a session. Does not return full message content.",
  promptSnippet: "Compact session metadata and main leaf preview",
  promptGuidelines: [
    "Always start with get_session_overview.",
    "If branchCount is greater than 1 or compactionCount is greater than 0, use get_session_map for branch/checkpoint orientation before range reads.",
  ],
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
    const targetSessionPath = await getTargetSessionPath(ctx);
    const sm = SessionManager.open(targetSessionPath);
    const view = createSessionViewFromSession(sm);
    const { entries } = view;
    const tree = view.getTree();
    const mainLeaf = view.mainLeafId
      ? view.getEntry(view.mainLeafId)
      : undefined;
    const mainBranchIds = view.getMainBranchIds();
    const labels = entries
      .filter((e) => e.type === "label")
      .map((e) => e.targetId)
      .filter(
        (id, entryIndex, ids) =>
          ids.indexOf(id) === entryIndex && !!view.getLabel(id),
      );
    const leaves = flattenTree(tree).filter(
      (entry) => view.getChildren(entry.id).length === 0,
    );
    const parentSessionPath =
      sm.getHeader()?.parentSession ??
      entries
        .map((entry) => getSessionLinkDetails(entry, SESSION_LINK_SOURCE_TYPE))
        .find((details) => details?.parentSessionFile)?.parentSessionFile;
    const childSessionPaths = uniqueStrings(
      entries.map(
        (entry) =>
          getSessionLinkDetails(entry, SESSION_LINK_MARKER_TYPE)
            ?.targetSessionFile,
      ),
    );

    const overview = {
      id: sm.getSessionId(),
      cwd: sm.getCwd(),
      name: sm.getSessionName(),
      created: sm.getHeader()?.timestamp,
      currentLeafId: sm.getLeafId(),
      mainLeafId: view.mainLeafId,
      mainLeafPreview: mainLeaf
        ? compactEntry(
            mainLeaf,
            view.getLabel(mainLeaf.id),
            view.getChildren(mainLeaf.id).length,
            mainBranchIds.has(mainLeaf.id),
          )
        : undefined,
      entryCount: entries.length,
      messageCount: entries.filter(
        (e) => e.type === "message" || e.type === "custom_message",
      ).length,
      compactionCount: entries.filter((e) => e.type === "compaction").length,
      branchCount: leaves.length,
      labelCount: labels.length,
      parentSessionPath,
      childSessionPaths,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(overview) }],
      details: { overview },
    };
  },
});
