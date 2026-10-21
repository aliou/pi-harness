import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";

export interface SubagentModelPreference {
  provider: string;
  model: string;
  thinking: ThinkingLevel | "off";
}

export interface SubagentResolvedModel {
  provider: string;
  model: string;
  thinking: ThinkingLevel | "off";
}

export interface SubagentSkippedModel {
  preference: SubagentResolvedModel;
  reason: string;
}

export interface SubagentModelChoice {
  model: Model<Api>;
  thinking: ThinkingLevel | "off";
  preference: SubagentResolvedModel;
  skipped: SubagentSkippedModel[];
}

export interface SubagentModelRanking {
  /** Candidates in attempt order; empty when nothing in the roster is usable. */
  candidates: SubagentModelChoice[];
  /** Roster entries excluded before ranking, with the reason. */
  skipped: SubagentSkippedModel[];
}
