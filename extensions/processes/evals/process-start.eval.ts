/**
 * Eval: agent uses the process tool to start a background process.
 *
 * Verifies the extension registers its tool correctly and the agent
 * picks it up when asked to run something in the background.
 */
import { evaluate, type Scorer } from "@aliou/pi-evals";

const usesProcessTool: Scorer = {
  name: "uses-process-tool",
  score: async (ctx) => {
    const startCall = ctx.toolCalls.find(
      (tc) => tc.name === "process" && tc.args.action === "start",
    );
    return {
      name: "uses-process-tool",
      score: startCall ? 1 : 0,
      reason: startCall
        ? `Agent called process tool with action=start`
        : "Agent did not use the process tool to start a background process",
    };
  },
};

evaluate("Process management - start", {
  config: {
    model: "gpt-4o",
    provider: "github",
    extensions: ["./index.ts"],
  },
  data: [
    {
      input:
        'Start a background process that runs "echo hello && sleep 5" and name it "test-echo".',
    },
  ],
  scorers: [usesProcessTool],
  timeout: 30_000,
});
