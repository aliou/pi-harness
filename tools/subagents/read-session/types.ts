import { type Static, Type } from "typebox";

export const ReadSessionParams = Type.Object({
  targetSessionId: Type.String({
    description: "Session UUID, UUID prefix, or path to a session .jsonl file.",
  }),
  goal: Type.String({
    description:
      "Specific extraction goal. Include known dates, projects, topics, files, decisions, commands, and desired output format.",
  }),
});

export type ReadSessionParamsType = Static<typeof ReadSessionParams>;

export interface ReadSessionState {
  targetSessionId: string;
  goal: string;
}
