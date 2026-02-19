---
name: pi-utils-settings
description: Guide for using @aliou/pi-utils-settings to add persistent settings to pi extensions. Use when implementing config loading, settings UI, migrations, scopes, or TUI components (ArrayEditor, PathArrayEditor, SectionedSettings) for a pi extension.
---

# pi-utils-settings

Shared settings infrastructure for pi extensions. Provides JSON config with scoped persistence, draft-based settings UI, and reusable TUI components.

## Quick Start

### 1. Define config types

Two types: a partial user-facing schema and a fully-resolved internal schema.

```typescript
// config.ts
import { ConfigLoader } from "@aliou/pi-utils-settings";

// User-facing: all fields optional (stored on disk)
interface MyConfig {
  features?: { darkMode?: boolean };
  tags?: string[];
}

// Internal: all fields required (defaults applied)
interface ResolvedConfig {
  features: { darkMode: boolean };
  tags: string[];
}

const defaults: ResolvedConfig = {
  features: { darkMode: false },
  tags: [],
};

export const configLoader = new ConfigLoader<MyConfig, ResolvedConfig>(
  "my-extension", // file name: ~/.pi/agent/extensions/my-extension.json (global)
  defaults,       //            .pi/extensions/my-extension.json (local)
);

// In extension activate():
await configLoader.load();
const config = configLoader.getConfig(); // ResolvedConfig
```

### 2. Register settings command

```typescript
import { registerSettingsCommand } from "@aliou/pi-utils-settings";

registerSettingsCommand<MyConfig, ResolvedConfig>(pi, {
  commandName: "my-ext:settings",
  title: "My Extension Settings",
  configStore: configLoader,
  buildSections: (tabConfig, resolved, { setDraft, scope }) => [
    {
      label: "General",
      items: [
        {
          id: "features.darkMode",
          label: "Dark mode",
          description: "Enable dark theme",
          currentValue: (tabConfig?.features?.darkMode ?? resolved.features.darkMode) ? "on" : "off",
          values: ["on", "off"],
        },
      ],
    },
  ],
});
```

## Scopes

ConfigLoader supports three scopes, merged lowest-to-highest priority:

| Scope    | Path                                         | Persisted |
|----------|----------------------------------------------|-----------|
| `global` | `~/.pi/agent/extensions/{name}.json`         | Yes       |
| `local`  | `{project}/.pi/extensions/{name}.json`       | Yes       |
| `memory` | In-memory only                               | No        |

Default: `["global", "local"]`. Configure via `scopes` option:

```typescript
new ConfigLoader("my-ext", defaults, {
  scopes: ["global", "memory"], // no local scope
});
```

The settings UI shows one tab per enabled scope. Tab/Shift+Tab switches tabs.

## Adding Settings Items

Each item in `buildSections` needs:

- `id`: Dot-separated path matching config structure (e.g. `"features.darkMode"`)
- `label`: Display name
- `currentValue`: Current display value as string
- `values`: Array of allowed string values (cycles on Enter/Space)
- `description` (optional): Shown below the list when selected

The default change handler maps `"on"`/`"enabled"` to `true`, `"off"`/`"disabled"` to `false`, and stores enum strings as-is. Override with `onSettingChange` for custom logic:

```typescript
onSettingChange: (id, newValue, config) => {
  const updated = structuredClone(config);
  if (id === "refreshInterval") {
    updated.refreshInterval = parseInt(newValue, 10);
  }
  return updated;
},
```

### Submenu Items

For arrays or complex values, use `submenu` instead of `values`:

```typescript
import { ArrayEditor, PathArrayEditor } from "@aliou/pi-utils-settings";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";

{
  id: "tags",
  label: "Tags",
  currentValue: `${tags.length} items`,
  submenu: (_val, done) => {
    const current = tabConfig ?? ({} as MyConfig);
    return new ArrayEditor({
      label: "Tags",
      items: [...(current.tags ?? resolved.tags)],
      theme: getSettingsListTheme(),
      onSave: (items) => {
        ctx.setDraft({ ...current, tags: items });
        done(`${items.length} items`);
      },
      onDone: () => done(undefined), // undefined = no change
    });
  },
}
```

`PathArrayEditor` is identical but adds Tab completion for filesystem paths. Accepts optional `validatePath` hook.

## Migrations

Transform config on load. Applied in order; if any run, the result is saved back to disk.

```typescript
import { type Migration } from "@aliou/pi-utils-settings";

const migrations: Migration<MyConfig>[] = [
  {
    name: "rename-field",
    shouldRun: (config) => "oldField" in config,
    run: (config) => {
      const { oldField, ...rest } = config as any;
      return { ...rest, newField: oldField };
    },
  },
];

new ConfigLoader("my-ext", defaults, { migrations });
```

## afterMerge Hook

For post-merge logic that cannot be expressed as a simple deep merge:

```typescript
new ConfigLoader("my-ext", defaults, {
  afterMerge: (resolved, global, local, memory) => {
    if (local?.overrideAll) {
      resolved.features = local.overrideAll;
    }
    return resolved;
  },
});
```

## ConfigStore Interface

Extensions with custom storage can implement `ConfigStore` directly instead of using `ConfigLoader`:

```typescript
interface ConfigStore<TConfig, TResolved> {
  getConfig(): TResolved;
  getRawConfig(scope: Scope): TConfig | null;
  hasScope(scope: Scope): boolean;
  hasConfig(scope: Scope): boolean;
  getEnabledScopes(): Scope[];
  save(scope: Scope, config: TConfig): Promise<void>;
}
```

## Helpers

```typescript
import { setNestedValue, getNestedValue, displayToStorageValue } from "@aliou/pi-utils-settings";

setNestedValue(obj, "a.b.c", true);    // obj.a.b.c = true (creates intermediates)
getNestedValue(obj, "a.b.c");          // returns obj.a.b.c or undefined
displayToStorageValue("on");            // true
displayToStorageValue("off");           // false
displayToStorageValue("pnpm");          // "pnpm"
```

## Setup Commands (Wizard Pattern)

For first-time configuration that walks users through multiple steps, register a separate setup command using `ctx.ui.custom` for each step. This is distinct from the settings command (which edits existing config).

```typescript
import type { Component } from "@mariozechner/pi-tui";
import { Input } from "@mariozechner/pi-tui";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";

// Step component: a simple text prompt
class UrlPrompt implements Component {
  private input: Input;
  private done: (value: string | undefined) => void;

  constructor(currentValue: string, done: (value: string | undefined) => void) {
    this.done = done;
    this.input = new Input();
    if (currentValue) this.input.setValue(currentValue);
    this.input.onSubmit = () => {
      const value = this.input.getValue().trim();
      if (!value) return;
      this.done(value);
    };
    this.input.onEscape = () => this.done(undefined);
  }

  render(width: number): string[] { /* ... */ }
  invalidate() {}
  handleInput(data: string) { this.input.handleInput(data); }
}

// Registration
pi.registerCommand("my-ext:setup", {
  description: "First-time setup wizard",
  handler: async (_args, ctx) => {
    const config = configLoader.getConfig();

    // Step 1: collect a URL
    const url = await ctx.ui.custom<string | undefined>((_tui, _theme, _kb, done) => {
      return new UrlPrompt(config.baseUrl, done);
    });
    if (!url) return; // user cancelled

    // Step 2: collect another value (same pattern)
    const name = await ctx.ui.custom<string | undefined>(/* ... */);
    if (!name) return;

    // Save all at once
    await configLoader.save("global", { baseUrl: url, name });
    ctx.ui.notify("Setup complete", "success");
  },
});
```

Each `ctx.ui.custom` call blocks until the component calls `done()`. Return `undefined` from the component to signal cancellation. Save config at the end after all steps succeed.

Wrap each step with `DynamicBorder` for visual boundaries (the settings command does this automatically). See the reference extension's `BorderedWrapper` pattern for a reusable approach.

## Components

This package includes TUI components for use in settings UIs and setup wizards. All are exported from `@aliou/pi-utils-settings`.

| Component            | Use case                                       |
|----------------------|------------------------------------------------|
| `SectionedSettings`  | Grouped settings list with search and submenus |
| `ArrayEditor`        | Edit a `string[]` (add/edit/delete)            |
| `PathArrayEditor`    | Same as ArrayEditor + Tab path completion      |
| `FuzzySelector`      | Fuzzy-searchable single-select list            |

These components implement the pi-tui `Component` interface (`render`, `handleInput`, `invalidate`). They are designed for use inside `registerSettingsCommand` submenus or `ctx.ui.custom` calls.

Note: `packages/ui/` is a separate package with different primitives (panels, tool renderers). There is no overlap.

## Save Model

All changes are held as in-memory drafts until Ctrl+S. Esc exits without saving. Dirty tabs show a `*` marker. After save, `onSave` callback fires (use to reload runtime state).

## Full Pattern

Typical extension file structure:

```
my-extension/
  index.ts       # activate() calls configLoader.load(), registers commands
  config.ts      # ConfigLoader + types + migrations
  commands/
    settings.ts  # registerSettingsCommand (edit existing config)
    setup.ts     # optional: multi-step wizard for first-time config
```

A complete reference extension is bundled at `references/example-extension/`. It demonstrates every feature: config types, migrations, afterMerge, settings command with all item types (toggles, enums, submenus with ArrayEditor/PathArrayEditor/FuzzySelector), setup wizard with multi-step `ctx.ui.custom`, and the activation pattern.
