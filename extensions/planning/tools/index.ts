/**
 * Planning extension tools
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createAskUserTool } from "./ask-user";
import { setupCreatePlanTool } from "./create-plan";
import { setupUpdatePlanTool } from "./update-plan";

export function setupPlanningTools(pi: ExtensionAPI) {
  pi.registerTool(createAskUserTool(pi));
  setupCreatePlanTool(pi);
  setupUpdatePlanTool(pi);
}
