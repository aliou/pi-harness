# @aliou/pi-agent-kit

Shared subagent infrastructure for my Pi harness. Extracted from the subagents extension to allow cross-extension reuse without relative path imports.

## What's included

- **`executeSubagent`** - Core executor with streaming, tool tracking, usage/cost accumulation, and injectable logging
- **`resolveModel`** - Resolve a model by provider + ID from the model registry
- **Types** - `SubagentToolCall`, `SubagentUsage`, `SubagentConfig`, `SubagentResult`, `BaseSubagentDetails`, etc.
- **Components** - `ToolDetails` and `ToolPreview` for rendering subagent tool results in the TUI

## Usage

```ts
import {
  executeSubagent,
  resolveModel,
  ToolDetails,
  ToolPreview,
  type SubagentToolCall,
  type SubagentUsage,
} from "@aliou/pi-agent-kit";
```

## Logging

The executor accepts an optional `createLogger` factory. If not provided (or if `config.logging.enabled` is false), no logging occurs. This keeps the package free of file I/O dependencies.

```ts
const result = await executeSubagent(
  config,
  userMessage,
  ctx,
  onTextUpdate,
  signal,
  onToolUpdate,
  async (opts) => createRunLogger(opts.cwd, opts.name, opts.debug),
);
```

## Components

`ToolDetails` accepts a generic `Component` for its footer (not `SubagentFooter` specifically), so consumers can provide any footer implementation.
