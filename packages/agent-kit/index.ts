import {
  type AgentSession,
  defineTool,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";
import { runWithFailover } from "./failover";
import type { SubagentModelPreference } from "./models";
import {
  renderSubagentCall,
  renderSubagentResult,
  SUBAGENT_ANNOTATIONS,
  SubagentOutputSchema,
  SubagentRuntime,
} from "./runtime";
import {
  createResumeSubagentParamsSchema,
  type ResumeSubagentParams,
} from "./schemas";
import { SubagentSessionManager } from "./session-manager";
import { SubagentSessionRecordStore } from "./session-records";
import { createStartupBudget, withStartupTimeout } from "./startup-timeout";
import type {
  ResolvedSubagentConfig,
  SubagentConfig,
  SubagentCwdResolver,
  SubagentToolSpec,
  SubagentToolsResolver,
} from "./types";

export { loadAgentsFilesFromCwd } from "./agents-files";

type SubagentExecutionOptions<Params extends TSchema> = {
  callId?: string;
  signal?: AbortSignal;
  onUpdate?: Parameters<SubagentRuntime<Params>["execute"]>[2];
  ctx: Parameters<SubagentRuntime<Params>["execute"]>[3];
};

export type SubagentRunOptions<Params extends TSchema> =
  SubagentExecutionOptions<Params> & {
    /** Replace the configured model roster for this invocation. */
    modelPreferences?: readonly SubagentModelPreference[];
  };

export type SubagentResumeOptions<Params extends TSchema> =
  SubagentExecutionOptions<Params>;

export type SubagentRegisterOptions = {
  tool?: boolean;
};

export function createSubagent<Params extends TSchema>(
  pi: ExtensionAPI,
  config: SubagentConfig<Params>,
) {
  const records = new SubagentSessionRecordStore(pi);
  // Placeholder; populated once by `ready`. All runtime/session-manager
  // access happens at execution time, after callers have awaited `ready`.
  const resolved = {
    ...config,
    modelPreferences: [],
    configured: typeof config.modelPreferences !== "function",
  } as ResolvedSubagentConfig<Params>;
  const ready = resolveSubagentConfig(config).then((r) => {
    resolved.modelPreferences = r.modelPreferences;
    resolved.configured = r.configured;
    return resolved;
  });
  const sessions = new SubagentSessionManager(resolved, records);

  const runWithParams = async (
    params: Static<Params>,
    options: SubagentRunOptions<Params>,
  ) => {
    const invocationCwd = await resolveCwd(
      config.resolveCwd,
      params,
      options.ctx,
    );
    const invocationSkills = config.resolveSkills?.(params, options.ctx) ?? [];
    const agentsFiles = config.resolveAgentsFiles
      ? await config.resolveAgentsFiles(params, options.ctx)
      : [];
    const invocationTools = await resolveTools(
      config.tools,
      params,
      options.ctx,
    );

    // One ranking per invocation, from one preference source: an eval roster
    // override must never be mixed with the configured roster mid-loop.
    const candidates = await sessions.rankCandidates(
      options.ctx,
      options.modelPreferences,
    );

    const { result } = await runWithFailover<
      Awaited<ReturnType<SubagentRuntime<Params>["execute"]>>,
      AgentSession
    >({
      label: resolved.label,
      candidates,
      budget: createStartupBudget(),
      signal: options.signal,
      notify: (message) => options.ctx.ui.notify(message, "warning"),
      runAttempt: async ({ choice, signal, started, own }) => {
        const session = await sessions.createSession(
          options.ctx,
          choice,
          invocationSkills,
          invocationTools,
          agentsFiles,
          invocationCwd,
        );
        own(session);
        return new SubagentRuntime(resolved, session, signal, started).execute(
          options.callId ?? config.name,
          params,
          options.onUpdate,
          options.ctx,
        );
      },
      onSettled: ({ choice, failure, owned: session }) => {
        if (!session) return;
        // A session abandoned before its first token has nothing to resume;
        // one that produced output stays resumable even if the attempt failed.
        if (!failure || failure.started) {
          sessions.recordSession(
            options.ctx,
            session,
            choice,
            invocationSkills,
          );
        } else {
          sessions.forgetSession(session.sessionId);
        }
      },
    });

    return result;
  };

  /**
   * Resumed runs never fail over: the pinned model owns the session history,
   * and a fresh session on another model would silently drop it. A failed
   * resume is fatal and names the provider/model so the parent can decide.
   */
  const resumeWithParams = async (
    sessionId: string,
    params: Static<Params>,
    options: SubagentResumeOptions<Params>,
  ) => {
    const invocationCwd = await resolveCwd(
      config.resolveCwd,
      params,
      options.ctx,
    );
    const invocationTools = await resolveTools(
      config.tools,
      params,
      options.ctx,
    );
    return withStartupTimeout(async (started) => {
      const session = await sessions.resume(
        sessionId,
        options.ctx,
        invocationTools,
        invocationCwd,
      );
      const runtime = new SubagentRuntime<Params>(
        resolved,
        session,
        options.signal,
        started,
      );
      return runtime.execute(
        options.callId ?? config.name,
        params,
        options.onUpdate,
        options.ctx,
      );
    }, resolved.label);
  };

  const asTool = () =>
    defineTool({
      name: config.name,
      label: config.label,
      description: config.description,
      promptSnippet: config.promptSnippet,
      promptGuidelines: config.promptGuidelines,
      parameters: config.parameters,
      outputSchema: SubagentOutputSchema,
      annotations: config.annotations ?? SUBAGENT_ANNOTATIONS,
      renderCall: (args, theme, ctx) =>
        renderSubagentCall(
          resolved,
          args as Record<string, unknown>,
          theme,
          ctx,
        ),
      renderResult: (result, options, theme, ctx) =>
        renderSubagentResult(resolved, result, options, theme, ctx),
      execute(toolCallId, params, signal, onUpdate, ctx) {
        return runWithParams(params as Static<Params>, {
          callId: toolCallId,
          signal,
          onUpdate,
          ctx,
        });
      },
    });

  const asResumeTool = () =>
    defineTool({
      name: `resume_${config.name}`,
      label: `Resume ${config.label}`,
      description: `Resume a previous ${config.label} session using its sessionId`,
      promptSnippet: `Resume a previous ${config.label} subagent session by sessionId.`,
      promptGuidelines: [
        `resume_${config.name}: Use only when continuing a known previous ${config.label} subagent session and you have its sessionId.`,
        `resume_${config.name}: Provide the new task or question plus any new context; do not assume the parent conversation is visible unless you include the relevant details.`,
      ],
      parameters: createResumeSubagentParamsSchema(config.parameters),
      outputSchema: SubagentOutputSchema,
      annotations: config.annotations ?? SUBAGENT_ANNOTATIONS,
      renderCall: (args, theme, ctx) =>
        renderSubagentCall(resolved, args, theme, ctx),
      renderResult: (result, options, theme, ctx) =>
        renderSubagentResult(resolved, result, options, theme, ctx),

      async execute(
        toolCallId,
        params: ResumeSubagentParams<Params>,
        signal,
        onUpdate,
        ctx,
      ) {
        const { sessionId, ...restParams } = params;
        return resumeWithParams(sessionId, restParams as Static<Params>, {
          callId: toolCallId,
          signal,
          onUpdate,
          ctx,
        });
      },
    });

  const subscribe = () => {
    pi.on("session_start", (event, ctx) => {
      sessions.handleSessionStart(event, ctx);
    });

    pi.on("session_shutdown", () => {
      sessions.handleSessionShutdown();
    });
  };

  const register = (options: SubagentRegisterOptions = {}) => {
    subscribe();

    if (options.tool ?? true) {
      pi.registerTool(asTool());
    }

    if (config.resumable ?? false) {
      pi.registerTool(asResumeTool());
    }
  };

  return {
    runWithParams,
    resumeWithParams,
    asTool,
    subscribe,
    register,
    /**
     * Resolves once the model roster has been loaded. Await this before
     * reading `configured` or executing; renderers and execution paths only
     * touch the roster after execution starts.
     */
    ready,
    /** False when an async model roster resolver produced no roster. */
    get configured() {
      return resolved.configured;
    },
  };
}

export async function resolveTools<Params extends TSchema>(
  tools: SubagentToolSpec[] | SubagentToolsResolver<Params>,
  params: Static<Params>,
  ctx: ExtensionContext,
): Promise<SubagentToolSpec[]> {
  return typeof tools === "function" ? await tools(params, ctx) : tools;
}

export async function resolveCwd<Params extends TSchema>(
  resolver: SubagentCwdResolver<Params> | undefined,
  params: Static<Params>,
  ctx: ExtensionContext,
): Promise<string | undefined> {
  return resolver ? await resolver(params, ctx) : undefined;
}

/**
 * Resolve a subagent config's model roster. When `modelPreferences` is a
 * resolver function it is invoked once (async) and the result is cached on
 * the returned config; the original config object is left untouched.
 * `configured` is false when a resolver produced no roster.
 */
export async function resolveSubagentConfig<Params extends TSchema>(
  config: SubagentConfig<Params>,
): Promise<ResolvedSubagentConfig<Params>> {
  if (typeof config.modelPreferences !== "function") {
    return {
      ...config,
      modelPreferences: config.modelPreferences,
      configured: true,
    };
  }

  const resolved: ResolvedSubagentConfig<Params> = {
    ...config,
    modelPreferences: [],
    configured: false,
  };

  try {
    const preferences = await config.modelPreferences();
    if (preferences && preferences.length > 0) {
      resolved.modelPreferences = preferences;
      resolved.configured = true;
    }
  } catch (error) {
    // Leave unconfigured; the extension surfaces the warning.
    void error;
  }

  return resolved;
}

export type { SubagentResolvedModel } from "./models";
export {
  SUBAGENT_SESSION_CUSTOM_TYPE,
  type SubagentSessionRecord,
  SubagentSessionRecordStore,
} from "./session-records";
export type {
  ResolvedSubagentConfig,
  SubagentAgentsFile,
  SubagentAgentsFilesResolver,
} from "./types";
