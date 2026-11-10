import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RexBlock, RexSession, RexSnapshot } from "./types";

interface RawSessionList {
  sessions: { session_id: string; label: string }[];
}

interface RawInspect {
  session_id: string;
  label: string;
  active_window_id?: string;
  windows: {
    window_id: string;
    label: string;
    focused_block_id?: string;
    layers: {
      blocks: { block_id: string; label: string }[];
    }[];
  }[];
}

export async function fetchRexSnapshot(
  pi: ExtensionAPI,
  signal?: AbortSignal,
): Promise<RexSnapshot> {
  const lsResult = await pi.exec("rex", ["ls", "--json"], {
    signal,
    timeout: 5000,
  });
  if (lsResult.code !== 0) return { sessions: [], blocks: [] };

  const sessions: RexSession[] = parseJson<RawSessionList>(
    lsResult.stdout,
  ).sessions.map((s) => ({ sessionId: s.session_id, label: s.label }));

  const inspected = await Promise.all(
    sessions.map(async (session): Promise<RexBlock[]> => {
      const result = await pi.exec(
        "rex",
        ["session", "inspect", session.sessionId, "--json"],
        { signal, timeout: 5000 },
      );
      if (result.code !== 0) return [];
      return toBlocks(parseJson<RawInspect>(result.stdout));
    }),
  );

  return { sessions, blocks: inspected.flat() };
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

function toBlocks(inspect: RawInspect): RexBlock[] {
  const session: RexSession = {
    sessionId: inspect.session_id,
    label: inspect.label,
  };
  const blocks: RexBlock[] = [];
  for (const window of inspect.windows) {
    for (const layer of window.layers) {
      for (const block of layer.blocks) {
        blocks.push({
          blockId: block.block_id,
          sessionId: session.sessionId,
          sessionLabel: session.label,
          windowId: window.window_id,
          windowLabel: window.label,
          blockLabel: block.label,
          focused: window.focused_block_id === block.block_id,
        });
      }
    }
  }
  return blocks;
}
