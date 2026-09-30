import type {
  AgentSession,
  AgentSessionEvent,
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isBlank } from "@harness/utils";
import type { Optional } from "@harness/utils/types";
import type { Static, TSchema } from "typebox";
import type { ResolvedSubagentConfig } from "../types";
import {
  type AttemptFailure,
  type AttemptPhase,
  SubagentAttemptError,
} from "./attempt";
import { buildBlankResponseError } from "./blank-response";
import { appendSubagentSessionFooter, textContent } from "./content";
import { buildSubagentOutput } from "./output";
import { SubagentRuntimeState } from "./runtime-state";
import { formatSubagentStatus } from "./status";
import type { SubagentDetails } from "./types";

export class SubagentRuntime<Params extends TSchema = TSchema> {
  private unsubscribe?: () => void;
  private state: SubagentRuntimeState;
  private toolCallCount = 0;
  private limitAbort = false;
  private started = false;
  private phase: AttemptPhase = "setup";

  constructor(
    private config: ResolvedSubagentConfig<Params>,
    private session: AgentSession,
    private signal: Optional<AbortSignal>,
    /**
     * Invoked once when the subagent first streams output (tokens, thinking,
     * or a tool call). The orchestration layer uses this to disarm the startup
     * timeout so a healthy, long-running call is never cancelled.
     */
    private onStarted?: () => void,
  ) {
    this.signal = signal;
    this.signal?.addEventListener?.("abort", this.onAbort);
    this.state = new SubagentRuntimeState(config, session);
  }

  async execute(
    _toolCallId: string,
    params: Static<Params>,
    onUpdate: Optional<AgentToolUpdateCallback<SubagentDetails>>,
    ctx: ExtensionContext,
  ): Promise<AgentToolResult<SubagentDetails>> {
    try {
      this.phase = "setup";
      this.signal?.throwIfAborted();
      const model = this.session.model;
      if (!model) {
        throw new Error(
          `Subagent ${this.config.label} has no resolved model for prompt compilation`,
        );
      }

      this.phase = "build-prompt";
      const promptResult = await this.config.buildPrompt(params, ctx, model);
      this.state.setPrompt(promptResult.text);
      this.state.setParams(params);
      this.unsubscribe = this.session.subscribe((event) => {
        this.handleEvent(event, onUpdate);
      });

      if (this.config.beforeExecute) {
        this.phase = "before-execute";
        try {
          await this.config.beforeExecute(params, this.session, ctx);
        } catch (err) {
          throw new Error(`An error occureed during \`beforeExecute\`: ${err}`);
        }
      }

      this.phase = "prompt";
      await this.session.prompt(promptResult.text, {
        images: promptResult.images,
      });

      if (this.signal?.aborted) {
        this.state.markAborted();
        throw new Error(this.state.value.error ?? "Subagent aborted");
      }

      this.phase = "blank-response";
      const response = this.session.getLastAssistantText();
      const lastAssistant = this.state.lastAssistant;
      // A message that carries text but ended in a provider error is a failed
      // turn, not a short answer: the text is a truncated prefix of an answer
      // the model never finished.
      if (isBlank(response) || lastAssistant?.stopReason === "error") {
        throw new Error(
          buildBlankResponseError(lastAssistant, this.config.name),
        );
      }
      return this.complete(response);
    } catch (err: unknown) {
      if (this.limitAbort) {
        return this.complete(this.session.getLastAssistantText() ?? "");
      }

      if (this.signal?.aborted) {
        this.state.markAborted();
        throw new Error(this.state.value.error ?? "Subagent aborted");
      }

      if (err instanceof Error) {
        this.state.markError(err.message);
      } else {
        this.state.markError("Unknown error");
      }

      throw new SubagentAttemptError(this.failure(err));
    } finally {
      if (this.signal && !this.signal.aborted) {
        this.signal.removeEventListener("abort", this.onAbort);
      }

      this.unsubscribe?.();
      this.session.dispose();
    }
  }

  /** Mark the run successful and build the tool result for `response`. */
  private complete(response: string): AgentToolResult<SubagentDetails> {
    this.state.markSuccess(response);
    const resumable = this.config.resumable ?? false;
    const content = resumable
      ? appendSubagentSessionFooter(
          response,
          this.config.name,
          this.session.sessionId,
        )
      : response;
    const details = this.state.snapshot();

    return {
      content: [textContent(content)],
      details,
      usage: details.usage,
      structuredContent: buildSubagentOutput(details, resumable),
    };
  }

  private handleEvent(
    event: AgentSessionEvent,
    onUpdate: Optional<AgentToolUpdateCallback<SubagentDetails>>,
  ) {
    // First model output (streaming tokens, thinking, or a tool call) means the
    // provider transport is delivering — notify the orchestration layer so it
    // can disarm the startup timeout.
    if (
      !this.started &&
      (event.type === "message_update" || event.type === "tool_execution_start")
    ) {
      this.started = true;
      this.onStarted?.();
    }

    const changed = this.state.applyEvent(event);
    if (!changed) return;

    if (event.type === "tool_execution_start") {
      this.toolCallCount++;
    }

    if (
      event.type === "tool_execution_end" &&
      this.config.maxToolCalls != null &&
      this.toolCallCount >= this.config.maxToolCalls &&
      !this.limitAbort
    ) {
      this.limitAbort = true;
      this.session.abort();
    }

    this.emitUpdate(onUpdate);
  }

  private emitUpdate(
    onUpdate?: Optional<AgentToolUpdateCallback<SubagentDetails>>,
  ) {
    onUpdate?.({
      content: [textContent(formatSubagentStatus(this.state.value))],
      details: this.state.snapshot(),
    });
  }

  private failure(cause: unknown): AttemptFailure {
    return {
      phase: this.phase,
      started: this.started,
      aborted: this.signal?.aborted ?? false,
      cause,
      assistant: this.state.lastAssistant,
      provider: this.session.model?.provider ?? "unknown",
      model: this.session.model?.id ?? "unknown",
      message: this.state.value.error ?? "Unknown error",
    };
  }

  private onAbort = () => {
    this.unsubscribe?.();
    this.session.abort();
  };
}
