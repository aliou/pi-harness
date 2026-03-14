import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupSessionCommands } from "./commands";
import { configLoader } from "./config";
import { setupPaletteRegistration } from "./hooks/palette";
import { setupProtectSessionsDirHook } from "./hooks/protect-sessions-dir";
import {
  setupSessionLinkMarkerRenderer,
  setupSessionLinkSourceRenderer,
} from "./lib/session-link";
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
  setupSessionLinkMarkerRenderer(pi);
  setupSessionLinkSourceRenderer(pi);
  setupSessionTools(pi, { handoffTool: config.handoffTool });
  setupSessionCommands(pi);
  setupPaletteRegistration(pi);

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
