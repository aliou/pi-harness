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
}

export const MODE_ORDER: string[] = ["default", "plan", "research"];

const PLAN_INSTRUCTIONS = [
  "You are in PLAN MODE.",
  "",
  "Rules:",
  "- Do not make changes. Never use write/edit/bash to modify state.",
  "- Read files in full to build complete context.",
  "- Explore related code paths and dependencies before planning.",
  "- Ask clarifying questions when requirements are ambiguous.",
  "",
  "Output a structured numbered implementation plan.",
  "For each step include: what changes, why, and key risks.",
].join("\n");

const RESEARCH_INSTRUCTIONS = [
  "You are in RESEARCH MODE.",
  "",
  "Rules:",
  "- Do not modify files or system state.",
  "- You may use bash only for read/search/inspection commands.",
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
  plan: {
    name: "plan",
    label: "plan",
    allowedTools: [
      "read",
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
    labelColor: (text: string) => `\u001b[35m${text}\u001b[0m`,
    provider: "openai-codex",
    model: "gpt-5.3-codex",
    instructions: PLAN_INSTRUCTIONS,
  },
  research: {
    name: "research",
    label: "research",
    allowedTools: [
      "read",
      "bash",
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
    deniedTools: ["write", "edit"],
    labelColor: (text: string) => `\u001b[36m${text}\u001b[0m`,
    provider: "anthropic",
    model: "claude-opus-4-6",
    bashAllowedCommands: [
      "rg",
      "find",
      "ls",
      "grep",
      "cat",
      "head",
      "tail",
      "wc",
      "file",
      "stat",
      "du",
      "tree",
      "which",
      "echo",
      "pwd",
    ],
    instructions: RESEARCH_INSTRUCTIONS,
  },
};

export const DEFAULT_MODE: ModeDefinition = MODES.default as ModeDefinition;
