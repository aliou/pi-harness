/**
 * Specialized subagents library.
 */

// API clients
export {
  createExaClient,
  createGitHubClient,
  ExaClient,
  type ExaContentsOptions,
  type ExaContentsResponse,
  type ExaContentsResult,
  type ExaSearchOptions,
  type ExaSearchResponse,
  type ExaSearchResult,
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
// Constants
export { PROVIDER } from "./constants";
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
  OnTextUpdate,
  OnToolUpdate,
  SubagentConfig,
  SubagentResult,
  SubagentToolCall,
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
  getSpinnerFrame,
  INDICATOR,
  type ModelRef,
  pluralize,
  renderDoneResult,
  renderStreamingStatus,
  renderSubagentCallHeader,
  SPINNER_FRAMES,
} from "./ui";
