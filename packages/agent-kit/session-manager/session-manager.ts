import * as path from "node:path";
import {
  type AgentSession,
  createAgentSession,
  type ExtensionContext,
  getAgentDir,
  SessionManager,
  type SessionStartEvent,
  SettingsManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { isNil } from "@harness/utils/nil";
import type { TSchema } from "typebox";
import {
  createSubagentModelRuntime,
  rankModels,
  resolveModel,
  type SubagentModelChoice,
  type SubagentModelPreference,
  type SubagentSkippedModel,
} from "../models";
import { SubagentResourceLoader } from "../resources/loader";
import { virtualModelExtensionPaths } from "../resources/virtual-models";
import {
  SUBAGENT_SESSION_CUSTOM_TYPE,
  type SubagentSessionRecord,
  type SubagentSessionRecordStore,
} from "../session-records";
import type {
  ResolvedSubagentConfig,
  SubagentAgentsFile,
  SubagentToolSpec,
} from "../types";

const DEFAULT_SUBAGENT_EXTENSION_PATHS: string[] = [
  // Injects pi-core's toolSnippets + promptGuidelines into the subagent's
  // custom system prompt (pi-core skips them in the customPrompt branch).
  // The handler reads them off event.systemPromptOptions and appends
  // "## Available tools" + "## Tool usage guidelines" sections.
  "./packages/agent-kit/extensions/subagent-tool-prompt",
  // Adds the `x-session-id` Aperture provenance header on every provider
  // request. Subagents do not load `pi-ts-aperture`, so without this their
  // requests are not grouped in Aperture traces. Set-if-absent keeps
  // Aperture authoritative in parents that also load this extension.
  "./hooks/provider-tweaks",
];

export class SubagentSessionManager<Params extends TSchema = TSchema> {
  private settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
  });
  private sessionFilesById = new Map<string, string>();
  private subagentDir = path.join(getAgentDir(), "subagents");

  constructor(
    private config: ResolvedSubagentConfig<Params>,
    private records: SubagentSessionRecordStore,
  ) {}

  /**
   * Candidates for a fresh run, in attempt order. Throws when the roster is
   * empty or nothing in it is usable; notifies once per skipped entry.
   */
  async rankCandidates(
    ctx: ExtensionContext,
    modelPreferences: readonly SubagentModelPreference[] = this.config
      .modelPreferences,
  ): Promise<SubagentModelChoice[]> {
    if (modelPreferences.length === 0) {
      throw new Error(
        `${this.config.label} subagent has no configured model roster`,
      );
    }

    const ranking = rankModels(ctx.modelRegistry, modelPreferences);
    if (ranking.candidates.length === 0) {
      this.notifySkipped(ctx, ranking.skipped);
      throw new Error(`No model available for ${this.config.label} subagent`);
    }

    this.notifySkipped(ctx, ranking.skipped);
    return ranking.candidates;
  }

  /** Create a fresh session bound to one candidate. One attempt, one session. */
  async createSession(
    ctx: ExtensionContext,
    selection: SubagentModelChoice,
    invocationSkills: Skill[],
    invocationTools: SubagentToolSpec[],
    agentsFiles: SubagentAgentsFile[],
    cwd?: string,
  ): Promise<AgentSession> {
    const effectiveCwd = cwd ?? ctx.cwd;
    const sessionManager = this.createSessionManager(effectiveCwd);
    return this.createAgentSession(
      ctx,
      selection,
      sessionManager,
      invocationSkills,
      invocationTools,
      agentsFiles,
      effectiveCwd,
    );
  }

  /**
   * Persist the record that makes a session resumable. Only called for an
   * attempt that answered (or at least produced output): a session abandoned
   * before its first token has nothing to resume.
   */
  recordSession(
    ctx: ExtensionContext,
    session: AgentSession,
    selection: SubagentModelChoice,
    invocationSkills: Skill[],
  ): void {
    this.records.append({
      type: SUBAGENT_SESSION_CUSTOM_TYPE,
      name: this.config.name,
      sessionId: session.sessionId,
      sessionFile: session.sessionFile ?? "",
      parentSessionId: ctx.sessionManager.getSessionId(),
      model: selection.preference,
      skills: invocationSkills,
    });
  }

  /** Drop an abandoned attempt from the resume cache. */
  forgetSession(sessionId: string): void {
    this.sessionFilesById.delete(sessionId);
  }

  async resume(
    sessionId: string,
    ctx: ExtensionContext,
    invocationTools: SubagentToolSpec[],
    cwd?: string,
  ) {
    const record = this.records.findBySessionId(
      ctx,
      this.config.name,
      sessionId,
    );
    const selection = await this.resolveModelOrThrow(ctx, record);
    const sessionManager = this.openSessionManager(sessionId, record);
    const effectiveCwd = cwd ?? ctx.cwd;

    return this.createAgentSession(
      ctx,
      selection,
      sessionManager,
      record?.skills ?? [],
      invocationTools,
      [],
      effectiveCwd,
    );
  }

  handleSessionStart(evt: SessionStartEvent, ctx: ExtensionContext) {
    if (evt.reason === "new" || evt.reason === "startup") {
      this.sessionFilesById.clear();
      return;
    }

    if (this.sessionFilesById.size > 0) {
      ctx.ui.notify(
        `[${this.config.name}] Subagent cache was not empty on session start; clearing`,
        "warning",
      );
      this.sessionFilesById.clear();
    }

    const records = this.records.findBySubagent(ctx, this.config.name);

    if (evt.reason === "fork") {
      const sourceSessionId = this.getParentSessionId(ctx);
      const sourceRecords = records
        .filter((entry) => entry.data?.parentSessionId === sourceSessionId)
        .map((entry) => entry.data)
        .filter((data) => !isNil(data));

      sourceRecords.forEach((record) => {
        const sm = SessionManager.forkFrom(
          record.sessionFile,
          ctx.cwd,
          this.subagentDir,
        );
        const sessionFile = sm.getSessionFile() ?? "";

        this.sessionFilesById.set(sm.getSessionId(), sessionFile);
        this.records.append({
          type: SUBAGENT_SESSION_CUSTOM_TYPE,
          name: this.config.name,
          sessionId: sm.getSessionId(),
          sessionFile,
          parentSessionId: ctx.sessionManager.getSessionId(),
          model: record.model,
          skills: record.skills,
        });
      });
      return;
    }

    if (evt.reason === "reload" || evt.reason === "resume") {
      const currentParentSessionId = ctx.sessionManager.getSessionId();
      const currentRecords = records
        .filter(
          (entry) => entry.data?.parentSessionId === currentParentSessionId,
        )
        .map((entry) => entry.data)
        .filter((data) => !isNil(data));

      currentRecords.forEach((record) => {
        this.sessionFilesById.set(record.sessionId, record.sessionFile);
      });
      return;
    }

    ctx.ui.notify(
      `[${this.config.name}] Unknown session event, subagent cache not rebuilt`,
      "warning",
    );
  }

  handleSessionShutdown() {
    this.sessionFilesById.clear();
  }

  private async createAgentSession(
    ctx: ExtensionContext,
    selection: SubagentModelChoice,
    sessionManager: SessionManager,
    invocationSkills: Skill[] = [],
    invocationTools: SubagentToolSpec[] = [],
    agentsFiles: SubagentAgentsFile[] = [],
    cwd: string = ctx.cwd,
  ) {
    const tools = invocationTools.map((tool) => tool.name);
    const customTools = invocationTools
      .filter((tool) => tool.type === "custom")
      .map((tool) => tool.spec(cwd));

    const routingPaths = await virtualModelExtensionPaths(
      selection.model,
      ctx.cwd,
      getAgentDir(),
    );
    const resourceLoader = new SubagentResourceLoader(
      cwd,
      this.config.systemPrompt,
      [...(this.config.skills ?? []), ...invocationSkills],
      mergeExtensionPaths(
        DEFAULT_SUBAGENT_EXTENSION_PATHS,
        this.config.extensionPaths ?? [],
        routingPaths,
      ),
      getAgentDir(),
      agentsFiles,
    );
    await resourceLoader.reload();
    const modelRuntime = await createSubagentModelRuntime(
      ctx.modelRegistry,
      selection.model,
    );

    const { session } = await createAgentSession({
      cwd,
      model: selection.model,
      thinkingLevel: selection.thinking,
      sessionManager,
      tools,
      customTools,
      agentDir: this.subagentDir,
      resourceLoader,
      modelRuntime,
      settingsManager: this.settingsManager,
    });

    return session;
  }

  private createSessionManager(cwd: string): SessionManager {
    const session = SessionManager.create(cwd, this.subagentDir);
    this.sessionFilesById.set(
      session.getSessionId(),
      session.getSessionFile() ?? "",
    );
    return session;
  }

  private openSessionManager(
    sessionId: string,
    record?: SubagentSessionRecord,
  ): SessionManager {
    const sessionFile =
      this.sessionFilesById.get(sessionId) ?? record?.sessionFile;
    if (isNil(sessionFile)) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    this.sessionFilesById.set(sessionId, sessionFile);
    return SessionManager.open(sessionFile);
  }

  private async resolveModelOrThrow(
    ctx: ExtensionContext,
    record?: SubagentSessionRecord,
  ): Promise<SubagentModelChoice> {
    if (this.config.modelPreferences.length === 0) {
      throw new Error(
        `${this.config.label} subagent has no configured model roster`,
      );
    }
    const selection = resolveModel(
      ctx.modelRegistry,
      this.config.modelPreferences,
      record?.model,
    );
    if (!selection) {
      throw new Error(`No model available for ${this.config.label} subagent`);
    }

    this.notifySkipped(ctx, selection.skipped);
    return selection;
  }

  private notifySkipped(
    ctx: ExtensionContext,
    skipped: readonly SubagentSkippedModel[],
  ) {
    for (const entry of skipped) {
      ctx.ui.notify(
        `[model] skipped ${entry.preference.provider}/${entry.preference.model}: ${entry.reason}`,
        "warning",
      );
    }
  }

  private getParentSessionId(ctx: ExtensionContext): string | undefined {
    const parentSessionFile = ctx.sessionManager.getHeader()?.parentSession;
    if (isNil(parentSessionFile)) return undefined;

    try {
      return SessionManager.open(parentSessionFile).getSessionId();
    } catch (_error) {
      void _error;
      return undefined;
    }
  }
}

function mergeExtensionPaths(...pathGroups: string[][]): string[] {
  return [...new Set(pathGroups.flat())];
}
