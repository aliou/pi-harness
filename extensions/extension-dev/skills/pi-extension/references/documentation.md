# Documentation

Every published extension should have a README that explains what it does, how to set it up, and what it provides.

## README Template

```markdown
# pi-my-extension

Brief description of the extension.

## Setup

\`\`\`bash
pi install @scope/pi-my-extension
\`\`\`

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MY_API_KEY` | Yes | API key from [provider](https://...) |

## Tools

| Tool | Description |
|---|---|
| `my_tool` | What it does |

## Commands

| Command | Description |
|---|---|
| `/my-command` | What it does |

## Providers

| Provider | Models |
|---|---|
| `my-provider` | model-a, model-b |
```

## What to Document

- **Installation**: `pi install` command.
- **Environment variables**: Every required and optional env var, with links to where to get them.
- **Tools**: Name and description of each registered tool. Include example usage if non-obvious.
- **Commands**: Name and description of each registered command.
- **Providers**: Provider name and available models (if the extension registers a provider).
- **Limitations**: Known limitations, unsupported modes, or missing features.

## Changelog

If using changesets, the CHANGELOG.md is generated automatically. Each changeset entry should describe what changed from the user's perspective, not implementation details.
