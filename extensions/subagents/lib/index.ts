/**
 * Specialized subagents library.
 */

// API clients
export {
  createGitHubClient,
  GitHubClient,
  type GitHubComment,
  type GitHubDirectoryItem,
  type GitHubFileContent,
  type GitHubIssue,
  type GitHubLabel,
  type GitHubPullRequest,
  type GitHubReadme,
  type GitHubRepository,
  type GitHubUser,
  type ParsedGitHubUrl,
  parseGitHubUrl,
} from "./clients";
// Core executor
export { executeSubagent, filterThinkingTags } from "./executor";
// Logging
export {
  createRunLogger,
  generateRunId,
  getLogDirectory,
  type RunLogger,
  sanitizePath,
} from "./logging";
// Model resolution
export { resolveModel } from "./model-resolver";
// Path utilities
export { shortenPath } from "./paths";
// Skills
export { type ResolveSkillsResult, resolveSkillsByName } from "./skills";
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
// UI
export {
  formatCost,
  formatSubagentStats,
  formatTokenCount,
  formatToolCallCompact,
  formatToolCallExpanded,
  getCurrentRunningTool,
  INDICATOR,
  type ModelRef,
  pluralize,
  renderDoneResult,
  renderStreamingStatus,
  renderSubagentCallHeader,
} from "./ui";
