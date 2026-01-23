import type {
  ExtensionAPI,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { AskUserQuestionParams } from "./schema";
import { createTool } from "./tool";
import type { AskUserQuestionDetails } from "./types";

export function createAskUserTool(
  pi: ExtensionAPI,
): ToolDefinition<typeof AskUserQuestionParams, AskUserQuestionDetails> {
  return createTool(pi);
}
