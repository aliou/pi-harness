/**
 * Planning Extension
 *
 * Commands for creating and executing implementation plans.
 *
 * Commands:
 * - /save-as-plan [instructions] - Create plan from conversation
 * - /execute-plan - Select and execute a plan
 *
 * Tools:
 * - ask_user - Gather user input through structured multiple-choice questions
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupPlanningCommands } from "./commands";
import { createAskUserTool } from "./tools/ask-user";

export default function (pi: ExtensionAPI) {
  setupPlanningCommands(pi);
  pi.registerTool(createAskUserTool(pi));
}
