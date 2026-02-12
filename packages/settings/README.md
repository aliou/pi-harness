# @aliou/pi-utils-settings

Shared settings infrastructure for [pi](https://github.com/mariozechner/pi-coding-agent) extensions. Provides config loading, a settings UI command with Local/Global tabs, and reusable TUI components.

This is a utility library, not a pi extension. It is meant to be used as a dependency by extensions that need a settings UI or JSON config management.

## Install

```bash
pnpm add @aliou/pi-utils-settings
```

## API

### ConfigLoader

Generic JSON config loader with global + project scopes, deep merge, and versioned migrations.

```typescript
import { ConfigLoader, type Migration } from "@aliou/pi-utils-settings";

interface MyConfig {
  features?: { darkMode?: boolean };
}

interface ResolvedConfig {
  features: { darkMode: boolean };
}

const migrations: Migration<MyConfig>[] = [
  {
    name: "v1-upgrade",
    shouldRun: (config) => !config.features,
    run: (config) => ({ ...config, features: {} }),
  },
];

const configLoader = new ConfigLoader<MyConfig, ResolvedConfig>(
  "my-extension", // reads ~/.pi/agent/extensions/my-extension.json + .pi/extensions/my-extension.json
  { features: { darkMode: false } }, // defaults
  { migrations },
);

await configLoader.load();
const config = configLoader.getConfig(); // ResolvedConfig (defaults merged with global + project)
```

An optional `afterMerge` hook runs after the deep merge for logic that can't be expressed as a simple merge (e.g., one field replacing another):

```typescript
new ConfigLoader("my-ext", defaults, {
  afterMerge: (resolved, global, project) => {
    if (project?.customField) {
      resolved.derivedField = project.customField;
    }
    return resolved;
  },
});
```

### registerSettingsCommand

Creates a `/name:settings` command with Local/Global tabs, draft-based editing, and Ctrl+S to save.

All changes (boolean toggles, enum cycling, submenu edits) are held in memory as drafts. Nothing is written to disk until the user presses Ctrl+S. Esc exits without saving. Dirty tabs show a `*` marker.

```typescript
import { registerSettingsCommand, type SettingsSection } from "@aliou/pi-utils-settings";

registerSettingsCommand<MyConfig, ResolvedConfig>(pi, {
  commandName: "my-ext:settings",
  title: "My Extension Settings",
  configStore: configLoader, // implements ConfigStore interface
  buildSections: (tabConfig, resolved, { setDraft }) => [
    {
      label: "General",
      items: [
        {
          id: "features.darkMode",
          label: "Dark mode",
          description: "Enable dark mode",
          currentValue: (tabConfig?.features?.darkMode ?? resolved.features.darkMode) ? "on" : "off",
          values: ["on", "off"],
        },
      ],
    },
  ],
});
```

### Submenu support

Items can open submenus by providing a `submenu` factory. Use `setDraft` inside submenu `onSave` to keep changes in the draft (same save model as simple values):

```typescript
import { ArrayEditor, setNestedValue } from "@aliou/pi-utils-settings";

{
  id: "tags",
  label: "Tags",
  currentValue: `${tags.length} items`,
  submenu: (_val, done) => {
    let latest = [...tags];
    return new ArrayEditor({
      label: "Tags",
      items: [...tags],
      theme: getSettingsListTheme(),
      onSave: (items) => {
        latest = items;
        const updated = structuredClone(tabConfig ?? {}) as MyConfig;
        setNestedValue(updated, "tags", items);
        setDraft(updated);
      },
      onDone: () => done(`${latest.length} items`),
    });
  },
}
```

### ConfigStore interface

Extensions with custom config loaders can implement `ConfigStore` directly instead of using `ConfigLoader`:

```typescript
interface ConfigStore<TConfig, TResolved> {
  getConfig(): TResolved;
  getRawConfig(scope: "global" | "project"): TConfig | null;
  hasConfig(scope: "global" | "project"): boolean;
  save(scope: "global" | "project", config: TConfig): Promise<void>;
}
```

### Components

- **SectionedSettings**: Grouped settings list with search filtering and cursor preservation on update.
- **ArrayEditor**: String array editor with add/remove/reorder.
- **PathArrayEditor**: Path-focused array editor with Tab completion in add/edit mode.

### Helpers

- `setNestedValue(obj, "a.b.c", value)`: Set a deeply nested value by dot-separated path.
- `getNestedValue(obj, "a.b.c")`: Get a deeply nested value by dot-separated path.
- `displayToStorageValue(id, displayValue)`: Convert display values (`"enabled"/"disabled"`, `"on"/"off"`) to storage values (`true/false`).

## Exports

```typescript
export { ConfigLoader, type ConfigStore, type Migration } from "./config-loader";
export { registerSettingsCommand, type SettingsCommandOptions } from "./settings-command";
export { SectionedSettings, type SectionedSettingsOptions, type SettingsSection } from "./components/sectioned-settings";
export { ArrayEditor, type ArrayEditorOptions } from "./components/array-editor";
export { PathArrayEditor, type PathArrayEditorOptions } from "./components/path-array-editor";
export { setNestedValue, getNestedValue, displayToStorageValue } from "./helpers";
```

## Patterns

### Dynamic Tool Activation on Config Change

When settings control tool availability, use `setActiveTools()` instead of conditionally registering tools.

**Problem**: Pi doesn't provide `unregisterTool()`, so re-registering tools in `onSave` causes duplicates.

**Solution**: Always register all tools at extension init, then use `setActiveTools()` to toggle which are active:

```typescript
// tools.ts - Always register both tool sets
export function setupTools(pi: ExtensionAPI): void {
  setupStandardTools(pi);
  setupAlternativeTools(pi);
  updateActiveTools(pi);
}

export function updateActiveTools(pi: ExtensionAPI): void {
  const config = configLoader.getConfig();
  const current = pi.getActiveTools();
  
  if (config.useAlternative) {
    // Enable alternative, disable standard
    const filtered = current.filter(t => t !== 'standard_tool');
    if (!filtered.includes('alt_tool')) filtered.push('alt_tool');
    pi.setActiveTools(filtered);
  } else {
    // Enable standard, disable alternative
    const filtered = current.filter(t => t !== 'alt_tool');
    if (!filtered.includes('standard_tool')) filtered.push('standard_tool');
    pi.setActiveTools(filtered);
  }
}

// settings-command.ts - Reload on save
registerSettingsCommand(pi, {
  // ... config ...
  onSave: async () => {
    await configLoader.load();
    updateActiveTools(pi);  // Toggle active tools without re-registering
  },
});
```

**Key points:**
- Tool names must be unique (don't override builtin tools like `read` or `edit`)
- All tools are registered once at extension load time
- `setActiveTools()` toggles availability without unregistering
- Config changes take effect immediately via `onSave` callback

See `extensions/defaults` for a complete implementation (hashline tools).
