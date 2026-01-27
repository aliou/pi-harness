# Writing Hooks

## Hook Registration

```typescript
// extensions/<name>/hooks/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupCleanupHook } from "./cleanup";

export function setupXxxHooks(pi: ExtensionAPI, manager: Manager) {
  setupCleanupHook(pi, manager);
}
```

## Individual Hook

```typescript
// extensions/<name>/hooks/cleanup.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function setupCleanupHook(pi: ExtensionAPI, manager: Manager) {
  pi.on("session_shutdown", async () => {
    manager.cleanup();
  });
}
```

## Available Events

Check Pi documentation for the current event list. Common events:
- `session_shutdown` - session is ending
- `turn_start` - agent turn starting
- `turn_end` - agent turn completed

## Passing State

If hooks need access to shared state (e.g., a manager class), pass it from the entry point:

```typescript
// extensions/<name>/index.ts
export default function (pi: ExtensionAPI) {
  const manager = new SomeManager();
  setupXxxTools(pi, manager);
  setupXxxHooks(pi, manager);
}
```
