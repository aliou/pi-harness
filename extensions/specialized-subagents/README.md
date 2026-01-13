# Specialized Subagents Extension

Framework for spawning specialized subagents with custom tools, consistent UI rendering, and logging.

## Features

- **Custom tools per subagent**: Each subagent has its own tool set
- **Streaming UI**: Tool call progress, spinner animation, markdown rendering
- **Cost tracking**: LLM tokens and external API costs (e.g., Exa)
- **Logging**: Session-like logging in `~/.pi/agent/subagents/`

## Requirements

The extension requires the following environment variables:

| Variable | Description |
|----------|-------------|
| `EXA_API_KEY` | [Exa](https://exa.ai) API key for web search and URL fetching |
| `GITHUB_TOKEN` | GitHub personal access token for repository access |

The extension will fail to load if any required variables are missing.

## Available Subagents

| Subagent | Description | Requirements |
|----------|-------------|--------------|
| Scout | Web research and GitHub codebase exploration. Fetches URLs, searches the web, explores repositories (code, commits, issues, PRs). | `EXA_API_KEY`, `GITHUB_TOKEN` |
| Lookout | Local codebase search by functionality/concept. Uses osgrep for semantic search + grep/find for exact matches. | [osgrep](https://github.com/Ryandonofrio3/osgrep) |

## Creating New Subagents

See the `create-specialized-subagent` skill and `subagents/scout/` for reference.
