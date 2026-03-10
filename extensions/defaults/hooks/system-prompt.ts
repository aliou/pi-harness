import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function setupSystemPromptHook(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const additions = [
      "",
      "Tool usage:",
      "- Use write instead of echo/heredoc for creating files.",
      "- Use grep instead of grep/rg in bash.",
      "- Reserve bash for: git, build/test, package managers, ssh, curl, process management.",
      "- When running multiple independent operations, call them all in a single response.",
      "- Read-only operations (read, find, grep) are always safe to parallelize.",
      "- Only serialize when one call depends on the result of another.",
    ].join("\n");

    return { systemPrompt: event.systemPrompt + additions };
  });
}
