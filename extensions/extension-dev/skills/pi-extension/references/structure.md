# Extension Structure

This covers the standalone repository structure for a Pi extension. This is the recommended layout for new extensions.

## Directory Layout

```
my-extension/
  src/
    index.ts              # Entry point (default export)
    config.ts             # Config schema (types) + loader + defaults
    client.ts             # API client (if wrapping a third-party API)
    tools/
      my-tool.ts          # One file per tool
    commands/
      my-command.ts        # One file per command
    components/
      my-renderer.ts       # Shared TUI components
    providers/
      index.ts             # Provider registration
      models.ts            # Model definitions
    utils/                 # Internal helpers (matching, parsing, etc.)
      my-helper.ts
  package.json
  tsconfig.json
  biome.json               # Linting/formatting (optional)
  .changeset/
    config.json            # Changeset config for versioning
  README.md
```

Not every extension needs every directory. A simple extension with one tool might only have `src/index.ts` and `src/tools/my-tool.ts`.

### Organization principles

- **`index.ts` and `config.ts`** stay at root. These are the two core files every non-trivial extension has.
- **Tools, commands, components, providers, hooks** each get their own directory. One file per tool/command/component.
- **Config types live in `config.ts`**, not a separate `types.ts` or `config-schema.ts`. The config file exports both the types (user-facing schema, resolved schema) and the config loader instance.
- **Utility/helper files** go in `utils/`. This includes pattern matching, shell parsing, event helpers, migrations, etc. Anything that is not a tool, command, component, provider, or hook.
- **No separate `types.ts`** unless the extension has shared types unrelated to config (rare). Config types are the most common shared types, and they belong in `config.ts`.

## package.json

```json
{
  "name": "@scope/pi-my-extension",
  "version": "0.1.0",
  "description": "Description of the extension",
  "type": "module",
  "license": "MIT",
  "pi": {
    "extensions": ["./src/index.ts"],
    "skills": ["./skills"],
    "themes": ["./themes"],
    "prompts": ["./prompts"],
    "video": "https://example.com/demo.mp4"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": ">=CURRENT_VERSION"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "CURRENT_VERSION",
    "@mariozechner/pi-tui": "CURRENT_VERSION",
    "typescript": "^5.8.0"
  },
  "pnpm": {
    "overrides": {
      "@mariozechner/pi-ai": "$@mariozechner/pi-coding-agent",
      "@mariozechner/pi-tui": "$@mariozechner/pi-coding-agent"
    }
  }
}
```

Replace `CURRENT_VERSION` with the actual installed version of pi (e.g., `0.51.2`).

### Fields

**`pi` key**: Declares extension resources. All paths are relative to the package root.

| Field | Description |
|---|---|
| `extensions` | Array of entry point paths. Each is a TypeScript file with a default export function. |
| `skills` | Array of directories containing skill definitions. Optional. |
| `themes` | Array of directories containing theme files. Optional. |
| `prompts` | Array of directories containing prompt files. Optional. |
| `video` | URL to an `.mp4` demo video. Displayed on the pi website package listing. Not used by pi itself. Optional. |

**`peerDependencies`**: Declares the minimum pi version required. Use `>=` with the current version when creating. The range can be relaxed later when verifying compatibility with older versions.

**`devDependencies`**: Same packages at exact versions for type checking during development.

**`pnpm.overrides`**: Ensures pi sub-packages resolve to the version bundled with pi-coding-agent, avoiding duplicate installations.

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "declaration": false,
    "jsx": "react-jsx",
    "jsxImportSource": "@mariozechner/pi-tui"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Extensions are loaded directly by pi (no build step). `noEmit: true` means TypeScript is only used for type checking. The `jsx` settings are only needed if you use JSX in TUI components.

## Entry Point (src/index.ts)

The entry point is a default export function that receives the `ExtensionAPI` object.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Register tools, commands, providers, hooks, etc.
}
```

If you need to await something at load time (e.g., checking an API subscription), use an async entry point:

```typescript
export default async function (pi: ExtensionAPI) {
  const isSubscribed = await checkSubscription();
  if (isSubscribed) {
    pi.registerTool(myTool);
  }
}
```

Prefer sync unless you genuinely need to await during registration.

## API Key Pattern

If your extension wraps a third-party API that requires an API key:

```typescript
export default function (pi: ExtensionAPI) {
  const apiKey = process.env.MY_API_KEY;

  // Register provider unconditionally if it exists
  // (provider handles missing key internally for model registration)
  pi.registerProvider(myProvider);

  // Only register tools that need the key
  if (!apiKey) {
    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.notify("MY_API_KEY not set. Tools disabled.", "warning");
    });
    return;
  }

  pi.registerTool(createMyTool(apiKey));
  pi.registerCommand(createMyCommand(apiKey));
}
```

The principle: check for the API key before registering anything that requires it. If the extension also registers a provider, the provider can be registered regardless (it handles key presence internally for model listing).

## Imports

Do not use `.js` file extensions in imports. Use bare module paths:

```typescript
// Correct
import { myTool } from "./tools/my-tool";
import type { MyType } from "./types";

// Wrong
import { myTool } from "./tools/my-tool.js";
```

## Monorepo Variant

In a monorepo with pnpm workspaces, the structure differs slightly. There is no `src/` directory; the entry point and config live directly in the package root.

```
extensions/
  my-extension/
    index.ts              # Entry point (no src/ directory)
    config.ts             # Config schema (types) + loader + defaults
    commands/
      settings-command.ts
    hooks/
      my-hook.ts
    components/
      my-editor.ts
    utils/
      matching.ts
      shell-utils.ts
    package.json
```

Key differences from standalone:
- Entry point directly in the package root (no `src/` directory).
- `"pi": { "extensions": ["./index.ts"] }` instead of `["./src/index.ts"]`.
- Uses `peerDependencies` (resolved by workspace root).
- Shared `tsconfig` from a workspace package.
- Same organization principles apply: config types in `config.ts`, helpers in `utils/`, one directory per feature category.

### Workspace dependencies

When an extension depends on another workspace package (e.g., `@aliou/pi-utils-settings`, `@aliou/pi-agent-kit`), use the `workspace:^` protocol instead of a version range:

```json
{
  "dependencies": {
    "@aliou/pi-utils-settings": "workspace:^",
    "@aliou/sh": "^0.1.0"
  }
}
```

Use `workspace:^` only for packages that live in this monorepo (under `packages/` or `extensions/`). External published packages like `@aliou/sh` keep regular version ranges.
