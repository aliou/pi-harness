/**
 * Handoff tool - agent-callable tool that extracts context and creates a new session.
 *
 * The agent can invoke this when the session is getting long, when switching
 * to a focused subtask, or when the user requests a handoff.
 */

import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { extractHandoffContext } from "../lib/handoff";

const HandoffParams = Type.Object({
  goal: Type.String({
    description:
      "A clear, specific description of the task for the new session. Should describe what needs to be done next, not a vague instruction like 'continue' or 'fix'.",
  }),
});

type HandoffParamsType = {
  goal: string;
};

interface HandoffDetails {
  goal: string;
  parentSessionId: string;
  filesExtracted: number;
  contextLength: number;
  error?: string;
}

export const HANDOFF_GUIDANCE = `
## Handoff - Session Context Transfer

Use the \`handoff\` tool when:
- Current session is getting too long and context is degrading
- Starting a focused subtask that deserves fresh context
- User explicitly requests a handoff
- Topic has significantly drifted from original goal

**How it works:**
1. Relevant files and context are extracted from the current session
2. A new session is created with extracted context
3. User navigates to the new session automatically

**Input:**
- \`goal\`: Clear, specific description of what the new session should accomplish
  - Good: "implement OAuth support for Linear API"
  - Bad: "continue" or "fix issues"

**Best practices:**
- Be specific in the goal -- it guides context extraction
- Handoff when context window is >60% full
- Handoff when switching to a distinct subtask
- Explain to user why you're recommending handoff

**The user can also initiate handoff via \`/handoff [goal]\` command.**
`;

export function setupHandoffTool(pi: ExtensionAPI) {
  pi.registerTool<typeof HandoffParams, HandoffDetails>({
    name: "handoff",
    label: "Handoff",
    description: `Create a new session with extracted context from the current session. Use when the session is getting long, when switching to a focused subtask, or when the user requests it.

The goal parameter guides what context to extract. Be specific -- vague goals lead to poor handoffs.

Example goals:
- "implement OAuth support for Linear API"
- "write tests for the user service module"
- "refactor database layer to use repository pattern"`,

    parameters: HandoffParams,

    async execute(
      _toolCallId: string,
      params: HandoffParamsType,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<HandoffDetails>> {
      const { goal } = params;
      const parentSessionId = ctx.sessionManager.getSessionId() ?? "unknown";

      try {
        const { extractedContext, filesExtracted, contextLength } =
          await extractHandoffContext(goal, ctx);

        // The tool cannot call ctx.newSession (only available in command context).
        // Instead, return the extracted context and instruct the user to run /handoff.
        return {
          content: [
            {
              type: "text",
              text: `Handoff context extracted (${filesExtracted} files, ${contextLength} chars). Ask the user to run \`/handoff ${goal}\` to create a new session with the context below.\n\n---\n\n${extractedContext}`,
            },
          ],
          details: {
            goal,
            parentSessionId,
            filesExtracted,
            contextLength,
          },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Handoff failed: ${error}` }],
          details: {
            goal,
            parentSessionId,
            filesExtracted: 0,
            contextLength: 0,
            error,
          },
        };
      }
    },

    renderCall(args: HandoffParamsType, theme: Theme) {
      const goal = args.goal.trim();
      const shortGoal = goal.length > 80 ? `${goal.slice(0, 77)}...` : goal;

      return new ToolCallHeader(
        {
          toolName: "Handoff",
          mainArg: shortGoal,
          longArgs:
            goal.length > 80
              ? [
                  {
                    label: "goal",
                    value: goal,
                  },
                ]
              : undefined,
        },
        theme,
      );
    },

    renderResult(
      result: AgentToolResult<HandoffDetails>,
      _options: ToolRenderResultOptions,
      theme: Theme,
    ): Text {
      const { details } = result;

      if (!details) {
        const text = result.content[0];
        const content = text?.type === "text" ? text.text : "No result";
        return new Text(content, 0, 0);
      }

      if (details.error) {
        return new Text(
          theme.fg("error", `Handoff failed: ${details.error}`),
          0,
          0,
        );
      }

      const lines = [
        theme.fg("success", `Context extracted for handoff`),
        theme.fg(
          "muted",
          `  ${details.filesExtracted} files, ${details.contextLength} chars of context`,
        ),
        theme.fg("muted", `  Goal: ${details.goal}`),
      ];

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
