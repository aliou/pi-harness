import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ExecuteResult } from "./component";
import type { AskUserQuestionDetails, Question } from "./types";

type AskUserResult = AgentToolResult<AskUserQuestionDetails>;

export function answeredResult(result: ExecuteResult): AskUserResult {
  const { questions, answers } = result.details;
  return { ...result, structuredContent: { questions, answers } };
}

export function cancelledResult(questions: Question[]): AskUserResult {
  return {
    content: [{ type: "text", text: "User cancelled" }],
    details: { questions, answers: [], error: "cancelled" },
    structuredContent: { questions, answers: [], cancelled: true },
  };
}

/** No UI can show the questions. The model sees `text`; scripts get `error`. */
export function unavailableResult(
  questions: Question[],
  text: string,
  error: string,
): AskUserResult {
  return {
    content: [{ type: "text", text }],
    details: { questions, answers: [], error },
    structuredContent: { questions, answers: [], error },
    isError: true,
  };
}
