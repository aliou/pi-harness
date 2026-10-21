import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagent } from "@harness/agent-kit";
import { isBlank } from "@harness/utils/string";
import { Type } from "typebox";
import {
  SESSION_NAME_FIRST_TOKEN_TIMEOUT_MS,
  SESSION_NAME_REFINE_EVERY,
} from "./constants";
import { isSessionNamePinned } from "./pinned";
import { buildPrompt, SESSION_NAME_SYSTEM_PROMPT } from "./prompt";
import { createSessionNameTools } from "./tools";
import { countCompletedAssistantTurns, getRecentTurns } from "./turns";

export function createSessionNameSubagent(
  pi: ExtensionAPI,
  onAutoName: (name: string) => void,
) {
  return createSubagent(pi, {
    name: "session_name",
    label: "Session Name",
    description: "Generate or refine a concise session name.",
    systemPrompt: SESSION_NAME_SYSTEM_PROMPT,
    tools: createSessionNameTools(pi, onAutoName),
    maxToolCalls: 1,
    modelPreferences: [
      { provider: "agents", model: "session_name", thinking: "off" },
    ],
    parameters: Type.Object({
      turns: Type.Array(
        Type.Object({
          userMessage: Type.String(),
          assistantResponse: Type.String(),
        }),
      ),
      currentName: Type.Optional(Type.String()),
    }),
    buildPrompt: (params) => ({ text: buildPrompt(params) }),
  });
}

/** An in-flight naming run and the controller that can cancel it. */
interface ActiveRun {
  controller: AbortController;
  /** True once the model started streaming a response. */
  receivedFirstToken: boolean;
}

export default async function sessionName(pi: ExtensionAPI): Promise<void> {
  // Name most recently set by the naming subagent itself, used to tell its
  // session_info_changed events apart from names set by the user.
  let lastAutoName: string | undefined;
  const subagent = createSessionNameSubagent(pi, (name) => {
    lastAutoName = name;
  });

  let activeRun: ActiveRun | null = null;

  /** Abort the in-flight naming run, if any. Idempotent. */
  const cancelActiveRun = (): void => {
    if (!activeRun) return;
    activeRun.controller.abort();
    activeRun = null;
  };

  // When the name is set or cleared by anything other than the naming
  // subagent (the /name command, RPC, another extension), cancel the
  // in-flight run so it cannot clobber that name.
  pi.on("session_info_changed", (event) => {
    if (event.name !== undefined && event.name === lastAutoName) return;
    cancelActiveRun();
  });

  // When the user starts a new turn, cancel a naming run that has not started
  // responding yet so its hung connection does not linger. A run that already
  // started streaming is left to finish in the background (it is about to set
  // the name and does not block the new turn, which runs in its own session).
  pi.on("turn_start", () => {
    if (activeRun && !activeRun.receivedFirstToken) {
      cancelActiveRun();
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (event.message.stopReason !== "stop") return;

    const entries = ctx.sessionManager.getBranch();

    // A name the user set themselves is pinned: skip both the initial naming
    // and later refines for the rest of the session.
    if (isSessionNamePinned(entries)) return;

    const turnCount = countCompletedAssistantTurns(entries);

    const isInitial = turnCount === 1;
    const isRefine =
      turnCount > 1 && turnCount % SESSION_NAME_REFINE_EVERY === 0;
    if (!isInitial && !isRefine) return;

    const turns = getRecentTurns(entries);
    if (turns.length === 0) return;

    if (!ctx.hasUI) return;

    // A previous run may still be in flight if the user did not send a new
    // message; drop it before starting a fresh one.
    cancelActiveRun();

    const currentName = pi.getSessionName();

    // Notifications are best-effort: the context may go stale if the session
    // is replaced or disposed while we are working.
    const notify = (
      message: string,
      type: "info" | "error" | "warning",
    ): void => {
      try {
        ctx.ui.notify(message, type);
      } catch (_error) {
        void _error;
      }
    };

    notify(
      isInitial ? "Generating session name..." : "Refining session name...",
      "info",
    );

    const controller = new AbortController();
    const run: ActiveRun = { controller, receivedFirstToken: false };
    const firstTokenTimer = setTimeout(() => {
      if (!run.receivedFirstToken) {
        controller.abort();
      }
    }, SESSION_NAME_FIRST_TOKEN_TIMEOUT_MS);

    // The subagent emits an update once it starts producing output (first
    // streaming activity). Clearing the timer on the first update turns it
    // into a "wait for first token" deadline rather than a hard runtime cap.
    const onUpdate = (): void => {
      run.receivedFirstToken = true;
      clearTimeout(firstTokenTimer);
    };

    const promise = (async () => {
      try {
        await subagent.runWithParams(
          { turns, currentName },
          { callId: "session-name", signal: controller.signal, ctx, onUpdate },
        );

        const name = pi.getSessionName();
        if (!isBlank(name)) {
          if (isBlank(currentName) || name === currentName) {
            notify(`Session name: ${name}`, "info");
          } else {
            notify(`Session name: from "${currentName}" to "${name}"`, "info");
          }
        }
      } catch (error: unknown) {
        // Cancellations (new turn or first-token timeout) are silent.
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        notify(`Session name generation failed: ${message}`, "error");
      } finally {
        clearTimeout(firstTokenTimer);
      }
    })();

    activeRun = run;

    // Free the slot once the run settles, without clobbering a newer run.
    void promise.finally(() => {
      if (activeRun === run) {
        activeRun = null;
      }
    });

    // Intentionally do not await `promise` here: the turn_end handler must
    // return so Pi can proceed to the next turn instead of queueing it.
  });
}
