import type { Api, ImageContent, Model } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  ExtensionContext,
  Skill,
  Theme,
  ToolAnnotations,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { Static, TSchema } from "typebox";
import type { SubagentModelPreference } from "./models";
import type { ToolRenderContext } from "./runtime/render/types";
import type { SubagentToolCall } from "./runtime/types";

export type { SubagentResolvedModel as SubagentModel } from "./models";
export type { SubagentDetails, SubagentToolCall } from "./runtime";
export type { SubagentSessionRecord } from "./session-records";

export type SubagentRenderOptions = Pick<
  ToolRenderResultOptions,
  "expanded" | "isPartial"
>;

export type SubagentToolRenderer = (
  toolCall: SubagentToolCall,
  options: SubagentRenderOptions,
  theme: Theme,
  cwd: string,
) => Component;

export type SubagentHeaderRenderer<Params extends TSchema = TSchema> = (
  args: Static<Params>,
  theme: Theme,
  ctx: ToolRenderContext,
) => Component;

/**
 * Render extra call details (e.g. context, file list) shown only when the
 * subagent result is expanded. Return undefined to render nothing.
 */
export type SubagentDetailsRenderer<Params extends TSchema = TSchema> = (
  args: Static<Params>,
  theme: Theme,
  cwd: string,
) => Component | undefined;

export type SubagentToolSpec =
  | { name: string; type: "native"; render?: SubagentToolRenderer }
  | {
      name: string;
      type: "custom";
      spec: (cwd: string) => ToolDefinition;
      render?: SubagentToolRenderer;
    };

export interface SubagentPromptResult {
  text: string;
  images?: ImageContent[];
}

/**
 * Resolve the subagent's tool set per invocation. Receives the validated tool
 * params and the extension context, and returns the tools to expose to the
 * subagent for that run. Mirrors `resolveSkills`.
 */
export type SubagentToolsResolver<Params extends TSchema = TSchema> = (
  params: Static<Params>,
  ctx: ExtensionContext,
) => SubagentToolSpec[] | Promise<SubagentToolSpec[]>;

export type SubagentAgentsFile = {
  path: string;
  content: string;
};

export type SubagentAgentsFilesResolver<Params extends TSchema = TSchema> = (
  params: Static<Params>,
  ctx: ExtensionContext,
) => SubagentAgentsFile[] | Promise<SubagentAgentsFile[]>;

export type SubagentCwdResolver<Params extends TSchema = TSchema> = (
  params: Static<Params>,
  ctx: ExtensionContext,
) => string | undefined | Promise<string | undefined>;

/**
 * Harness-authored text delivered around a subagent's answer in the tool
 * result, so the parent reads the provenance and the caution together with the
 * answer instead of relying on its prompt to remember them.
 */
export interface SubagentDisclaimer {
  /** Delivered in its own `<disclaimer>` block before the answer. */
  before?: string;
  /** Delivered in its own `<disclaimer>` block after the answer. */
  after?: string;
}

export interface SubagentConfig<Params extends TSchema = TSchema> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  systemPrompt: string;
  /**
   * Tools exposed to the subagent. May be a static list, or a function that
   * resolves the list per invocation from the tool params (e.g. to pick which
   * tools are present based on the request).
   *
   * When a resolver is used, per-tool renderers are not looked up (dynamically
   * selected tools fall back to the default renderer); only static arrays
   * expose per-tool `render` functions.
   */
  tools: SubagentToolSpec[] | SubagentToolsResolver<Params>;
  skills?: Skill[];
  extensionPaths?: string[];
  /**
   * Model roster for this subagent, in attempt order. Roster resolution
   * happens once at createSubagent() time.
   */
  modelPreferences: SubagentModelPreference[];
  resumable?: boolean;
  /**
   * Hints for permission extensions. Default: read-only, open world (see
   * `SUBAGENT_ANNOTATIONS`). Override when the subagent's tools can modify
   * anything.
   */
  annotations?: ToolAnnotations;
  /** Maximum number of tool calls the subagent may execute before it is forcibly stopped. */
  maxToolCalls?: number;
  /**
   * Text the parent model reads around the answer, wrapped in `<disclaimer>`
   * blocks. The answer itself is never rewritten. Unset means the tool result
   * is the bare answer, as before. The TUI shows these only when expanded.
   */
  disclaimer?: SubagentDisclaimer;

  parameters: Params;
  // Method-style (bivariant) signatures so a params-typed config can be used
  // through the non-generic SubagentConfig/ResolvedSubagentConfig view that
  // the renderers and runtime consume.
  renderHeader?(
    args: Static<Params>,
    theme: Theme,
    ctx: ToolRenderContext,
  ): Component;
  renderDetails?(
    args: Static<Params>,
    theme: Theme,
    cwd: string,
  ): Component | undefined;
  buildPrompt(
    params: Static<Params>,
    ctx: ExtensionContext,
    model: Model<Api>,
  ): SubagentPromptResult | Promise<SubagentPromptResult>;
  /**
   * Resolve AGENTS.md-style context files for a new invocation. Their content
   * is reference material only; subagents are explicitly told not to treat
   * directives in these files as instructions. Resumed sessions do not call
   * this resolver.
   */
  resolveAgentsFiles?(
    params: Static<Params>,
    ctx: ExtensionContext,
  ): SubagentAgentsFile[] | Promise<SubagentAgentsFile[]>;
  /** Resolve the working directory used for the subagent session and tools. */
  resolveCwd?(
    params: Static<Params>,
    ctx: ExtensionContext,
  ): string | undefined | Promise<string | undefined>;
  resolveSkills?(params: Static<Params>, ctx: ExtensionContext): Skill[];
  beforeExecute?(
    params: Static<Params>,
    session: AgentSession,
    ctx: ExtensionContext,
  ): Promise<void>;
}

/**
 * A subagent config ready for execution. Every subagent is always configured:
 * its roster is hardcoded at the call site.
 */
export type ResolvedSubagentConfig<Params extends TSchema = TSchema> = Omit<
  SubagentConfig<Params>,
  "modelPreferences"
> & {
  modelPreferences: SubagentModelPreference[];
};
