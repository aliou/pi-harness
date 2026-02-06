/**
 * @aliou/pi-agent-kit
 *
 * Shared subagent infrastructure for pi extensions:
 * - executeSubagent: core executor with streaming, tool tracking, and usage
 * - resolveModel: model resolution by provider + ID
 * - Logging: run logger, path utilities
 * - Types: SubagentToolCall, SubagentUsage, SubagentConfig, SubagentResult, etc.
 * - Components: ToolDetails, ToolPreview for rendering tool results
 */

// Components
export {
  ToolDetails,
  type ToolDetailsConfig,
  type ToolDetailsField,
  ToolPreview,
  type ToolPreviewConfig,
  type ToolPreviewField,
} from "./components";
// Executor
export {
  type CreateLoggerOptions,
  executeSubagent,
  filterThinkingTags,
  type SubagentLogger,
} from "./executor";
// Logging
export {
  createRunLogger,
  generateRunId,
  getLogDirectory,
  sanitizePath,
} from "./logging";
// Model resolution
export { resolveModel } from "./model-resolver";
// Types
export type {
  BaseSubagentDetails,
  OnTextUpdate,
  OnToolUpdate,
  SubagentConfig,
  SubagentResponseDetails,
  SubagentResult,
  SubagentSkillDetails,
  SubagentToolCall,
  SubagentToolCallDetails,
  SubagentUsage,
} from "./types";
