import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupSessionCommands } from "./commands";
import { configLoader } from "./config";
import { setupProtectSessionsDirHook } from "./hooks/protect-sessions-dir";
import {
  setupHandoffMarkerRenderer,
  setupHandoffSourceRenderer,
} from "./lib/handoff-marker";
import {
  FIND_SESSIONS_GUIDANCE,
  HANDOFF_GUIDANCE,
  READ_SESSION_GUIDANCE,
  setupSessionTools,
} from "./tools";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();

  setupProtectSessionsDirHook(pi);
  setupHandoffMarkerRenderer(pi);
  setupHandoffSourceRenderer(pi);
  setupSessionTools(pi, { handoffTool: config.handoffTool });
  setupSessionCommands(pi);

  const guidances = [FIND_SESSIONS_GUIDANCE, READ_SESSION_GUIDANCE];
  if (config.handoffTool) {
    guidances.push(HANDOFF_GUIDANCE);
  }

  pi.on("before_agent_start", async (event) => {
    const guidance = guidances.join("\n");
    return {
      systemPrompt: `${event.systemPrompt}\n${guidance}`,
    };
  });
}
