import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent } from "@harness/agent-kit";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import { renderReadSessionHeader, tools } from "./tools";
import { ReadSessionParams } from "./types";

export async function registerReadSession(pi: ExtensionAPI): Promise<void> {
  const subagent = createSubagent(pi, {
    name: "read_session",
    modelPreferences: [
      { provider: "agents", model: "read_session", thinking: "off" },
    ],
    label: "Read Session",
    description:
      "Zero-shot past-session extractor. Provide a session ID/path plus a specific extraction goal with names, dates, topics, and expected output.",
    promptSnippet:
      "Past-session extractor for pulling specific facts, decisions, summaries, or evidence from Pi session history.",
    promptGuidelines: [
      "read_session: Use to extract specific information from a past Pi coding session by session ID, UUID prefix, or session .jsonl file path.",
      "read_session: Do not use for the current session or general codebase search.",
      "read_session: Provide a narrow, self-contained goal with known names, dates, projects, topics, files, decisions, or tool names plus the expected output shape.",
      "read_session: Pi sessions are trees. Ask it to inspect the session map when branch structure, compactions, or final/current state matter.",
      "read_session: Ask for cited session evidence when you need exact decisions, commands, or implementation details; ask it to say 'not found' for missing facts rather than infer.",
    ],
    systemPrompt: SYSTEM_PROMPT,
    tools,
    parameters: ReadSessionParams,
    renderHeader: renderReadSessionHeader,
    buildPrompt,

    // Store a custom entry with the target session id.
    beforeExecute: async (params, session, _ctx) => {
      // Log
      session.sessionManager.appendCustomEntry("read-session-state", {
        targetSessionId: params.targetSessionId,
        goal: params.goal,
      });
    },
  });

  subagent.register();
}
