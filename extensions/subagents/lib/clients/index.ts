/**
 * API clients for external services.
 */

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
} from "./github";

export {
  createLinkupClient,
  LinkupClient,
  type LinkupFetchOptions,
  type LinkupFetchResponse,
  type LinkupImage,
} from "./linkup";
