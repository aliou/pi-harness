import type {
  ContextEvent,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const PROCEED_CUSTOM_TYPE = "harness:proceed";

export const PROCEED_DESCRIPTION =
  "Resume the agentic loop without sending prompt text to the LLM";

function isProceedMarker(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { role?: unknown; customType?: unknown };
  return (
    candidate.role === "custom" && candidate.customType === PROCEED_CUSTOM_TYPE
  );
}

export default function proceedCommand(pi: ExtensionAPI): void {
  pi.on("context", (event: ContextEvent) => {
    const messages = event.messages.filter(
      (message) => !isProceedMarker(message),
    );
    if (messages.length !== event.messages.length) {
      return { messages };
    }
    return undefined;
  });

  pi.registerCommand("proceed", {
    description: PROCEED_DESCRIPTION,
    handler: async () => {
      pi.sendMessage(
        {
          customType: PROCEED_CUSTOM_TYPE,
          content: [],
          display: false,
          details: undefined,
        },
        {
          triggerTurn: true,
          deliverAs: "followUp",
        },
      );
    },
  });
}
