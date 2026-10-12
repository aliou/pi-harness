import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import {
  emptyUsage,
  isAssistantMessage,
  SubagentCostTracker,
} from "./cost-tracker";
import { SubagentMessageTracker } from "./message-tracker";
import { SubagentToolCallTracker } from "./tool-call-tracker";
import type { SubagentDetails } from "./types";

export class SubagentRuntimeState {
  private messageTracker = new SubagentMessageTracker();
  private toolCallTracker = new SubagentToolCallTracker();
  private costTracker = new SubagentCostTracker();
  private lastAssistantMessage?: AssistantMessage;
  private details: SubagentDetails;

  constructor(private session: AgentSession) {
    this.details = {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile ?? "",
      prompt: "",
      model: undefined,

      status: "pending",
      thinking: false,
      toolCalls: this.toolCallTracker.calls,
      activity: [],
      usage: emptyUsage(),
      responseTokens: 0,
      startedAt: null,
      endedAt: null,
    };
    this.syncModel();
  }

  get value() {
    return this.details;
  }

  get lastAssistant() {
    return this.lastAssistantMessage;
  }

  setPrompt(prompt: string) {
    this.details.prompt = prompt;
  }

  setParams(params: unknown) {
    this.details.params = params;
  }

  applyEvent(event: AgentSessionEvent) {
    switch (event.type) {
      case "message_update": {
        const changed = this.messageTracker.update(event);
        if (!changed) return false;

        this.syncActivity();
        this.details.thinking = this.messageTracker.thinking;
        this.markRunning();
        return true;
      }

      case "tool_execution_start": {
        this.toolCallTracker.start(event);
        this.syncActivity();
        this.markRunning();
        return true;
      }

      case "tool_execution_end": {
        this.toolCallTracker.end(event);
        this.markRunning();
        return true;
      }

      case "turn_end": {
        this.stopThinking();
        this.syncActivity();
        this.markRunning();
        return true;
      }

      case "message_end": {
        if (isAssistantMessage(event.message)) {
          this.lastAssistantMessage = event.message;
          // A response names the physical model it ran on; the routed model
          // becomes resolvable the first time an assistant message completes.
          this.syncModel();
        }
        const changed = this.costTracker.update(event);
        if (!changed) return false;

        this.details.usage = this.costTracker.value;
        this.details.responseTokens = this.costTracker.responseTokens;
        return true;
      }

      default:
        return false;
    }
  }

  markSuccess(response: string) {
    this.stopThinking();
    this.details = {
      ...this.details,
      response,
      thinking: false,
      status: "success",
      endedAt: Date.now(),
    };
  }

  markError(error: string) {
    this.stopThinking();
    this.details = {
      ...this.details,
      status: "error",
      thinking: false,
      error,
      endedAt: Date.now(),
    };
  }

  markAborted() {
    this.stopThinking();
    this.details = {
      ...this.details,
      thinking: false,
      status: "aborted",
      error: "Subagent aborted",
      endedAt: Date.now(),
    };
  }

  snapshot(): SubagentDetails {
    return {
      ...this.details,
      toolCalls: [...this.details.toolCalls],
      activity: [...this.details.activity],
      usage: this.details.usage,
    };
  }

  private syncActivity() {
    this.details.activity = [
      ...this.messageTracker.activity,
      ...this.toolCallTracker.activity,
    ].sort((a, b) => a.startedAt - b.startedAt);
  }

  /**
   * Track the model the run actually answers with. Under a virtual (alias)
   * selection, `routedModel` names the physical model of the latest response;
   * before the first response (and for physical selections) it is undefined
   * and the selection itself is what the footer shows.
   */
  private syncModel() {
    const routed = this.session.routedModel;
    if (routed) {
      this.details.model = {
        provider: routed.model.provider,
        model: routed.model.id,
        thinking: routed.thinkingLevel ?? this.session.thinkingLevel,
      };
      return;
    }
    const model = this.session.model;
    if (model) {
      this.details.model = {
        provider: model.provider,
        model: model.id,
        thinking: this.session.thinkingLevel,
      };
    }
  }

  private markRunning() {
    if (this.details.startedAt === null) {
      this.details.startedAt = Date.now();
    }
    this.details.status = "running";
  }

  private stopThinking() {
    this.messageTracker.stopThinking();
    this.details.thinking = false;
    this.syncActivity();
  }
}
