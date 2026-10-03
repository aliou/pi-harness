# Test Harness

Test utilities for pi-harness extensions. Uses real Pi internals (`SessionManager`, `ExtensionAPI`, event bus) instead of deep proxy mocks. Every context method is a `vi.fn()` spy, so tests stay readable and assertions work as expected.

## Quick start

```ts
import { createPiTestHarness, type PiTestHarness } from "@harness/test-utils/pi-test-harness";
import { setupMyTool } from "./my-tool";

let pi: PiTestHarness;

beforeEach(async () => {
  pi = await createPiTestHarness(setupMyTool);
});

it("registers the tool", () => {
  expect(pi).toHaveRegisteredTool("my-tool");
});
```

Pass your extension's setup function (the `ExtensionFactory`) to `createPiTestHarness`. It loads the extension through `loadExtensionFromFactory`, the same code path Pi uses at runtime.

`tests/vitest.setup.ts` mocks `node:fs` and `node:fs/promises` with `memfs` for the whole suite, resets the volume before each test, and creates the virtual system temp directory. The harness creates its default cwd in that volume. Seed fixtures with `vol.fromJSON()`; tests that need a fixed home or temp path can mock `node:os` locally. A spawned shell or `rg` process cannot see memfs. `tools/bash/index.test.ts` and `tools/scout/tools/grep.test.ts` unmock `node:fs`, create temporary host directories, and run their real subprocesses. `packages/agent-kit/resources/virtual-models.integration.test.ts` also uses a temporary host directory because Pi's externalized package resolver reads the real filesystem. The unit config excludes `node_modules` so workspace symlinks do not duplicate tests.

## Testing tools

`pi.tool(name)` returns a handle with `execute()` and `registered` (the `ToolDefinition`).

```ts
const result = await pi.tool("read").execute({ path: "file.txt" });
expect(result.content).toBeDefined();
```

Access `renderCall` and `renderResult` on the `registered` definition for testing tool UI rendering. Use `NOOP_THEME` from `@harness/test-utils/theme` when calling render functions:

```ts
import { NOOP_THEME } from "@harness/test-utils/theme";

const { registered } = pi.tool("read");
const rendered = registered.renderCall({ path: "file.txt" }, NOOP_THEME);
```

### Structured output

`expectStructuredOutput(definition, result)` from `@harness/test-utils/structured-output` asserts that the tool declares an `outputSchema` and that `result.structuredContent` matches it:

```ts
import { expectStructuredOutput } from "@harness/test-utils/structured-output";

const tool = pi.tool("find");
const result = await tool.execute({ pattern: "*.ts" });
expectStructuredOutput(tool.registered, result);
```

## Testing commands

`pi.command(name)` returns a handle with `execute(args, overrides)`.

### Context overrides

Set context overrides at harness creation time. They apply to every `execute()` call on that harness instance:

```ts
const notify = vi.fn();
const setEditorText = vi.fn();

const pi = await createPiTestHarness(setupMyCommand, {
  context: {
    sessionManager: parentSm,
    ui: { notify, setEditorText },
  },
});

await pi.command("my-cmd").execute("some args");

expect(notify).toHaveBeenCalledWith("done", "info");
expect(setEditorText).toHaveBeenCalledWith("expected text");
```

Per-call overrides can still be passed to `execute()` and merge on top. UI overrides are deep-merged so harness-level and per-call spies coexist.

Any context method you do not override gets a default `vi.fn()` spy.

### Session overrides

Pass a real `SessionManager` as `sessionManager` when the command reads session state. Use `SessionManager.inMemory()` to create one without touching disk:

```ts
const parentSm = SessionManager.inMemory();
parentSm.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });

const pi = await createPiTestHarness(setupSpawnCommand, {
  context: { sessionManager: parentSm },
});
```

## Child sessions (newSession)

The harness includes a built-in `newSession` spy. When a command calls `ctx.newSession()`, the spy creates a real `SessionManager.inMemory()` and runs the `setup()` callback on it. Inspect what the command wrote to the child session via `pi.getChildSessionManager()`:

```ts
await pi.command("spawn").execute("focus on tests");

expect(pi.newSession).toHaveBeenCalledTimes(1);

const childSm = pi.getChildSessionManager();
const entries = childSm.getEntries();
// assert on entries written by the command's setup callback
```

If you need to override `newSession` with custom behavior, pass it in the context overrides. The harness default is replaced for that harness instance.

## Custom matchers

Loaded automatically via `tests/vitest.setup.ts`. Available on any `PiTestHarness` instance:

- `expect(pi).toHaveRegisteredTool("name")` -- asserts the extension registered a tool with that name.
- `expect(pi).toHaveRegisteredCommand("name")` -- asserts the extension registered a command with that name.

## File layout

| File | Purpose |
|---|---|
| `packages/test-utils/pi-test-harness.ts` | Main entry point. Creates the harness, loads the extension, exposes command/tool executors and the `newSession` spy. |
| `packages/test-utils/pi-context.ts` | Builds spy-based `ExtensionCommandContext` and tool context objects. All methods are `vi.fn()` with safe defaults. |
| `packages/test-utils/matchers.ts` | Custom vitest matchers (`toHaveRegisteredTool`, `toHaveRegisteredCommand`). |
| `packages/test-utils/structured-output.ts` | `expectStructuredOutput` for checking `structuredContent` against a tool's `outputSchema`. |
| `packages/test-utils/theme.ts` | `NOOP_THEME` constant for testing render functions without a real terminal theme. |
| `packages/test-utils/load-extension.ts` | Thin wrapper around pi-coding-agent's internal `loadExtensionFromFactory`. Single consumer of the `#pi-internal/extensions-loader` alias defined in `vitest.config.ts`. |
| `packages/test-utils/pi-internal.d.ts` | Type declarations for the aliased internal module. |
| `tests/vitest.setup.ts` | Setup file that loads custom matchers. Referenced in `vitest.config.ts`. |

## Design principles

- **Real internals, not proxy mocks.** Extensions register through the actual `ExtensionAPI` code path. `SessionManager.inMemory()` stores real entries. No auto-generated nested mocks that silently succeed on any property access.
- **Explicit spies.** Every context method is a `vi.fn()` with a sensible default. Tests see exactly which properties exist, and typos cause errors instead of returning undefined proxies.
- **Harness-level defaults.** Context overrides (session manager, UI spies) are set once at harness creation and apply to all executions. Per-call overrides merge on top when a specific test needs something different.
