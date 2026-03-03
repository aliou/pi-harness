/**
 * Planning Extension
 *
 * Commands for creating and executing implementation plans.
 *
 * Commands:
 * - /plan:save [instructions] - Create plan from conversation
 * - /plan:execute - Select and execute a plan
 *
 * Tools:
 * - ask_user - Gather user input through structured multiple-choice questions
 * - create_plan - Creates a draft plan scaffold with deduced frontmatter
 * - update_plan - Updates frontmatter status/dependencies and full plan content
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupPlanningCommands } from "./commands";
import { setupPlanningHooks } from "./hooks";
import { setupPlanningTools } from "./tools";

export default function (pi: ExtensionAPI) {
  setupPlanningCommands(pi);
  setupPlanningHooks(pi);
  setupPlanningTools(pi);
}
