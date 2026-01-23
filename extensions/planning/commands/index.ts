import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupExecutePlanCommand } from "./execute-plan";
import { setupSaveAsPlanCommand } from "./save-as-plan";

export function setupPlanningCommands(pi: ExtensionAPI) {
  setupSaveAsPlanCommand(pi);
  setupExecutePlanCommand(pi);
}
