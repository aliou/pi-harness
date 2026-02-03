import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupSessionCommands } from "./commands";
import { setupProtectSessionsDirHook } from "./hooks/protect-sessions-dir";
import {
  FIND_SESSIONS_GUIDANCE,
  READ_SESSION_GUIDANCE,
  setupSessionTools,
} from "./tools";

const SESSION_TOOLS_GUIDANCES = [FIND_SESSIONS_GUIDANCE, READ_SESSION_GUIDANCE];

export default function (pi: ExtensionAPI) {
  setupProtectSessionsDirHook(pi);
  setupSessionTools(pi);
  setupSessionCommands(pi);

  pi.on("before_agent_start", async (event) => {
    const guidance = SESSION_TOOLS_GUIDANCES.join("\n");
    return {
      systemPrompt: `${event.systemPrompt}\n${guidance}`,
    };
  });
}
