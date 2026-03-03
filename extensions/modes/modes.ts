export interface ModeDefinition {
  name: string;
  label: string;
  allowedTools: string[];
  deniedTools: string[];
  labelColor: (text: string) => string;
  provider?: string;
  model?: string;
  instructions?: string;
  bashAllowedCommands?: string[];
  bashConfirmEachCall?: boolean;
}

export const MODE_ORDER: string[] = ["default", "research"];

const RESEARCH_INSTRUCTIONS = [
  "You are in RESEARCH MODE.",
  "",
  "Rules:",
  "- Do not modify files or system state.",
  "- Use read + grep/find/ls for local code exploration.",
  "- Prefer deep exploration and evidence-backed findings.",
  "",
  "Output clear findings with sources, assumptions, and open questions.",
].join("\n");

export const MODES: Record<string, ModeDefinition> = {
  default: {
    name: "default",
    label: "",
    allowedTools: [],
    deniedTools: [],
    labelColor: (text: string) => text,
  },
  research: {
    name: "research",
    label: "research",
    // This list is used both for tool gating and (when applied) as the active tool set.
    allowedTools: [
      "read",
      "ls",
      "find",
      "grep",
      "find_sessions",
      "read_session",
      "scout",
      "lookout",
      "oracle",
      "reviewer",
      "jester",
      "synthetic_web_search",
      "get_current_time",
    ],
    deniedTools: ["write", "edit", "bash"],
    labelColor: (text: string) => `\u001b[36m${text}\u001b[0m`,
    provider: "anthropic",
    model: "claude-opus-4-6",
    instructions: RESEARCH_INSTRUCTIONS,
  },
};

export const DEFAULT_MODE: ModeDefinition = MODES.default as ModeDefinition;
