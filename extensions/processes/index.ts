import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupProcessesCommands } from "./commands";
import { PROCESSES_SYSTEM_PROMPT } from "./constants";
import { setupProcessesHooks } from "./hooks";
import { ProcessManager } from "./manager";
import { setupProcessesTools } from "./tools";

export default function (pi: ExtensionAPI) {
  const manager = new ProcessManager();

  setupProcessesTools(pi, manager);
  setupProcessesCommands(pi, manager);
  setupProcessesHooks(pi, manager);

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + PROCESSES_SYSTEM_PROMPT,
    };
  });
}
