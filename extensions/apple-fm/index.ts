import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { streamAppleFM } from "./stream";

export default function appleFMExtension(pi: ExtensionAPI): void {
  pi.registerProvider("apple-fm", {
    baseUrl: "local://apple-fm",
    apiKey: "not-needed",
    api: "apple-fm-bridge",
    models: [
      {
        id: "apple-foundation-model",
        name: "Apple Foundation Model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 4096,
        maxTokens: 4096,
      },
    ],
    streamSimple: streamAppleFM,
  });
}
