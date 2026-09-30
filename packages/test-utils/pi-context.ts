/**
 * Explicit spy-based context builders for Pi extension tests.
 *
 * Every function property is a `vi.fn()` with a sensible default. This makes
 * tests readable (you see exactly which properties exist) and keeps call
 * tracking / override ergonomics that deep proxy mocks provide, without the
 * hidden "any property access succeeds" footgun.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

/**
 * ReadonlySessionManager is not exported from pi-coding-agent's public API.
 * We reconstruct the type here as a Pick of SessionManager.
 */
type ReadonlySessionManager = Pick<
  SessionManager,
  | "getCwd"
  | "getSessionDir"
  | "getSessionId"
  | "getSessionFile"
  | "getLeafId"
  | "getLeafEntry"
  | "getEntry"
  | "getLabel"
  | "getBranch"
  | "buildContextEntries"
  | "getHeader"
  | "getEntries"
  | "getTree"
  | "getSessionName"
  | "buildSessionProjection"
>;

// ---------------------------------------------------------------------------
// UI context
// ---------------------------------------------------------------------------

export type UIOverrides = Partial<ExtensionUIContext>;

function createUIContext(overrides: UIOverrides = {}): ExtensionUIContext {
  return {
    select: vi.fn(async () => undefined),
    confirm: vi.fn(async () => false),
    input: vi.fn(async () => undefined),
    notify: vi.fn(),
    onTerminalInput: vi.fn(() => () => {}),
    setEditorText: vi.fn(),
    getEditorText: vi.fn(() => ""),
    setToolsExpanded: vi.fn(),
    ...overrides,
  } as ExtensionUIContext;
}

// ---------------------------------------------------------------------------
// Command context
// ---------------------------------------------------------------------------

export interface CommandContextOverrides {
  cwd?: string;
  hasUI?: boolean;
  mode?: ExtensionCommandContext["mode"];
  ui?: UIOverrides;
  /**
   * Session entries returned by the stub sessionManager's `getEntries`.
   * Ignored when `sessionManager` is provided.
   */
  entries?: unknown[];
  branch?: unknown[];
  sessionName?: string;
  sessionManager?: ReadonlySessionManager;
  modelRegistry?: ExtensionCommandContext["modelRegistry"];
  model?: ExtensionCommandContext["model"];
  scopedModels?: ExtensionCommandContext["scopedModels"];
  isIdle?: () => boolean;
  abort?: () => void;
  hasPendingMessages?: () => boolean;
  shutdown?: () => void;
  getContextUsage?: ExtensionCommandContext["getContextUsage"];
  compact?: () => void;
  getSystemPrompt?: () => string;
  getSystemPromptOptions?: () => ExtensionCommandContext["getSystemPromptOptions"] extends () => infer R
    ? R
    : never;
  waitForIdle?: () => Promise<void>;
  newSession?: ExtensionCommandContext["newSession"];
  fork?: ExtensionCommandContext["fork"];
  navigateTree?: ExtensionCommandContext["navigateTree"];
  switchSession?: ExtensionCommandContext["switchSession"];
  reload?: () => Promise<void>;
  isProjectTrusted?: () => boolean;
}

/**
 * Build an `ExtensionCommandContext` with every method as a spy.
 * Pass overrides for the properties your test cares about.
 */
export function createCommandContext(
  overrides: CommandContextOverrides = {},
): ExtensionCommandContext {
  const ui = createUIContext(overrides.ui);

  return {
    cwd: overrides.cwd ?? process.cwd(),
    hasUI: overrides.hasUI ?? true,
    mode: overrides.mode ?? "tui",
    ui,
    signal: undefined,
    sessionManager:
      overrides.sessionManager ??
      stubSessionManager({
        entries: overrides.entries,
        branch: overrides.branch,
        sessionName: overrides.sessionName,
      }),
    modelRegistry:
      overrides.modelRegistry ??
      ({} as ExtensionCommandContext["modelRegistry"]),
    model: overrides.model ?? undefined,
    scopedModels: overrides.scopedModels ?? [],
    isIdle: vi.fn(overrides.isIdle ?? (() => true)),
    abort: vi.fn(overrides.abort ?? (() => {})),
    hasPendingMessages: vi.fn(overrides.hasPendingMessages ?? (() => false)),
    shutdown: vi.fn(overrides.shutdown ?? (() => {})),
    getContextUsage: vi.fn(overrides.getContextUsage ?? (() => undefined)),
    compact: vi.fn(overrides.compact ?? (() => {})),
    getSystemPrompt: vi.fn(overrides.getSystemPrompt ?? (() => "")),
    waitForIdle: vi.fn(overrides.waitForIdle ?? (async () => {})),
    newSession: vi.fn(
      overrides.newSession ?? (async () => ({ cancelled: false })),
    ),
    fork: vi.fn(overrides.fork ?? (async () => ({ cancelled: false }))),
    navigateTree: vi.fn(
      overrides.navigateTree ?? (async () => ({ cancelled: false })),
    ),
    switchSession: vi.fn(
      overrides.switchSession ?? (async () => ({ cancelled: false })),
    ),
    reload: vi.fn(overrides.reload ?? (async () => {})),
    getSystemPromptOptions: vi.fn(
      overrides.getSystemPromptOptions ??
        (() =>
          ({}) as ExtensionCommandContext["getSystemPromptOptions"] extends () => infer R
            ? R
            : never),
    ),
    isProjectTrusted: vi.fn(overrides.isProjectTrusted ?? (() => true)),
  } as ExtensionCommandContext;
}

// ---------------------------------------------------------------------------
// Tool context
// ---------------------------------------------------------------------------

export interface ToolContextOverrides {
  cwd?: string;
  sessionManager?: ReadonlySessionManager;
  /**
   * Session entries returned by the stub sessionManager's `getEntries`.
   * Ignored when `sessionManager` is provided.
   */
  entries?: unknown[];
  branch?: unknown[];
  sessionName?: string;
  model?: ToolContext["model"];
  thinkingLevel?: ToolContext["thinkingLevel"];
}

type ToolContext = NonNullable<
  Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4]
>;

/**
 * Build a minimal tool execution context. Tools typically only need `cwd`;
 * tools that inspect session state (e.g. bash's PI_* env vars) also get a
 * stubbed sessionManager.
 */
export function createToolContext(
  overrides: ToolContextOverrides = {},
): ToolContext {
  return {
    cwd: overrides.cwd ?? process.cwd(),
    signal: undefined,
    sessionManager:
      overrides.sessionManager ??
      stubSessionManager({
        entries: overrides.entries,
        branch: overrides.branch,
        sessionName: overrides.sessionName,
      }),
    model: overrides.model ?? undefined,
    thinkingLevel: overrides.thinkingLevel ?? undefined,
  } as ToolContext;
}

type ExecutableToolDefinition<TDetails> = {
  execute(
    toolCallId: string,
    params: never,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
    ctx: ToolContext,
  ): Promise<AgentToolResult<TDetails>>;
};

export interface ExecuteToolDefinitionOptions<TDetails = unknown>
  extends ToolContextOverrides {
  toolCallId?: string;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<TDetails>;
}

export function executeToolDefinition<TDetails = unknown>(
  definition: ExecutableToolDefinition<TDetails>,
  params: unknown,
  {
    toolCallId = "tc_1",
    signal,
    onUpdate,
    ...contextOverrides
  }: ExecuteToolDefinitionOptions<TDetails> = {},
): Promise<AgentToolResult<TDetails>> {
  return definition.execute(
    toolCallId,
    params as never,
    signal,
    onUpdate,
    createToolContext(contextOverrides),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal stub for ReadonlySessionManager when the test does not interact
 * with session state at all. Every method is a vi.fn() returning a safe
 * default.
 */
function stubSessionManager({
  entries = [],
  branch = [],
  sessionName,
}: {
  entries?: unknown[];
  branch?: unknown[];
  sessionName?: string;
} = {}): ReadonlySessionManager {
  return {
    getCwd: vi.fn(() => process.cwd()),
    getSessionDir: vi.fn(() => ""),
    getSessionId: vi.fn(() => "stub-session-id"),
    getSessionFile: vi.fn(() => undefined),
    getLeafId: vi.fn(() => null),
    getLeafEntry: vi.fn(() => undefined),
    getEntry: vi.fn(() => undefined),
    getLabel: vi.fn(() => undefined),
    getBranch: vi.fn(() => branch),
    buildContextEntries: vi.fn(() => []),
    getHeader: vi.fn(() => undefined),
    getEntries: vi.fn(() => entries),
    getTree: vi.fn(() => []),
    getSessionName: vi.fn(() => sessionName),
    buildSessionProjection: vi.fn(() => ({
      entries: [],
      messages: [],
      thinkingLevel: "off",
      model: null,
    })),
  } as unknown as ReadonlySessionManager;
}
