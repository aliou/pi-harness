# pi-harness

My personal harness around [Pi](https://github.com/badlogic/pi-mono/) for coding-agent work.

This repo is a pnpm workspace. Internal shared dependencies live in `packages/` under the `@harness/*` scope and are private to this repository.

## Documentation maintenance

Keep this file current when adding, removing, moving, or materially changing commands, hooks, tools, extensions, packages, or shared architecture.

When adding new content or changing existing behavior, update the closest relevant documentation in the same change. Repository-level docs belong here. Feature-specific docs belong next to that feature only when they are actively maintained.

## Structure

- `commands/` - Slash commands and command-like UI flows.
- `hooks/` - Event hooks, lifecycle behavior, autocomplete providers, chrome, and background behavior.
- `tools/` - Agent tools exposed to Pi sessions.
- `skills/` - Skills shipped with the harness and loaded via the `pi.skills` manifest entry in `package.json`.
- `evals/` - Live model evals that run separately from unit tests; shared eval infrastructure lives in `evals/lib/`.
- `packages/` - Shared internal workspace packages. Each package lives in `packages/<name>/` and is imported through its `@harness/*` workspace package name.
- `scripts/` - Maintenance, native build, and extension Gist release scripts.
- `tests/` - Test setup and docs. Shared test utilities live in `packages/test-utils`.

## New feature placement

New functionality should be added as one of:

- `commands/<name>/` for slash commands.
- `hooks/<name>/` for event-driven behavior, UI chrome, autocomplete, lifecycle hooks, or background observers.
- `tools/<name>/` for agent-callable tools.
- `packages/<name>/` for shared internal code.
- `skills/<name>/` for skills shipped with the harness (declared in `package.json` under `pi.skills`).

Avoid cross-imports between `commands/`, `hooks/`, and `tools/`. If code needs to be shared across those areas:

1. Vendor it locally if it is tiny and unlikely to grow.
2. Prefer adding it to an existing `packages/*` workspace package when it fits.
3. Create a new `packages/*` workspace package when it is a distinct shared concern.

## Entry point convention

Every extension entry point is `export default function(pi: ExtensionAPI)`, calling `pi.registerCommand(...)`, `pi.registerTool(...)`, or `pi.on(...)` directly. No wrapper functions.

Pi discovers extensions from the root `package.json` `pi.extensions` array. Directories in that list are scanned for `index.ts` entry points.

## File layout convention

Within a command, hook, or tool directory:

- `index.ts` - Registration code. All `pi.*` and `ctx.*` calls live here.
- `types.ts` - Type definitions and TypeBox schemas when needed.
- `render.ts` / `renderers.ts` - Tool/message render functions when needed.
- `helpers.ts` / `fetch.ts` / `sanitize.ts` / `blocked-paths.ts` - Pure functions and utilities. Names vary by domain.

No `pi.*` or `ctx.*` calls outside `index.ts`. Other files contain only pure functions, types, components, or utils.

### Subagent-based tools

Tools that spawn a subagent follow a different layout:

- `index.ts` - Registration code. Spawns the subagent via `ctx.newSession()`.
- `types.ts` - Subagent details schema and shared types.
- `prompt.ts` - System prompt builder for the subagent.
- `models/index.ts` - Model selection for the subagent.
- `tools/` - Subagent tool definitions, visible only inside the subagent.
- `lib/` - Supporting logic.

Current subagent-based tools include `advisor`, `look-at`, `oracle`, `read-session`, `reviewer`, and `scout`.

### Subagent model rosters

Subagent model rosters are not defined in this repository. They live in the global config file `$PI_CODING_AGENT_DIR/settings/subagent-models.json`, a map of subagent name to its full weighted roster:

```json
{
  "advisor": [
    { "provider": "anthropic", "model": "claude-opus-4-8", "thinking": "xhigh", "weight": 1 }
  ]
}
```

`@harness/subagent-models` owns the path, the async cached loader, and validation. Each subagent passes `modelPreferences: () => getSubagentModelPreferences("<name>")` to `createSubagent` and awaits `subagent.ready`. There are no built-in defaults: when the file is missing/invalid or has no roster for a name, the subagent stays disabled — registration is a no-op (via `configuredSubagent`) and the user gets a single session-start warning. Execution-time roster replacement for evals (`SubagentRunOptions.modelPreferences`) is unchanged.


#### Weight semantics

A roster is a ranking, not a single draw. `rankModels` filters out entries the registry does not know or cannot auth, then orders the survivors:

- **Positive weights** are ranked by weighted random sampling without replacement. The first entry follows the same distribution as a plain weighted draw (`weight 2` leads twice as often as `weight 1`), and the rest are a fair continuation of it. Two `weight 1` entries are a deliberate 50/50 split.
- **Zero and negative weights are never drawn.** They are appended after every positive-weight entry, in roster order, as last-resort fallbacks. Roster order is the only thing that breaks ties between them, so list credit-based providers last.

There is no `enabled` flag: to stop using a model, remove it from the roster.

#### Failover

A fresh run walks the ranking until a model answers. Only failures **before the first streamed token** advance to the next entry — quota/billing exhaustion, transient 429/5xx, transport errors, deterministic model rejections, and connect-but-no-tokens stalls. Once output has streamed, a failure is fatal, because a fresh session on another model would silently drop what the caller already saw. Context overflow, aborts, prompt-build failures, and clean-but-empty completions are never retried.

A provider-scoped failure (quota, transient, or stall) also drops that provider's remaining entries for the invocation and arms a 5-minute in-process cooldown, so the next spawn skips it instead of re-probing. When every usable candidate is cooled the cooldown is ignored — one probe beats no subagent.

The startup (time-to-first-token) timeout is armed **per attempt** (25s), under an invocation-wide budget (60s) that keeps several stalling providers from stacking full windows. Both disarm permanently on the first streamed output. Fatal subagent errors name the provider/model that produced them.

Resumed runs never fail over: the pinned model owns the session history, so a failed resume is fatal and names the provider/model.

### Parent prompts for subagents

Subagents are zero-shot: only their final response is returned to the parent. Parent agents should make each subagent call self-contained.

Subagent runs that produce no final answer fail the parent tool call. Provider context-overflow errors tell the parent to start a fresh, narrower subagent call because resuming retains the oversized context.

- Advisory and review subagents (`advisor`, `oracle`, `reviewer`) prefer outcome-first prompts: outcome, what good means, constraints, how to verify, available evidence, and desired final shape. Avoid process-heavy step lists unless the sequence is a hard requirement.
- Research and extraction subagents (`scout`, `read-session`) prefer narrow scope, explicit constraints, concrete search targets, and requested evidence. Ask for files, line ranges, session evidence, or `not found` instead of allowing inference.
- Vision subagents (`look-at`) prefer precise multimodal objectives: what visible evidence to inspect, what to ignore, and the desired output format.

Code-reading subagents can opt into project context through `resolveAgentsFiles`. The resolver runs only for new invocations and returns the exact AGENTS.md-style files exposed to the subagent. Agent-kit marks those files as factual reference context rather than authoritative instructions, so their implementation and workflow directives do not override the subagent's assigned role. `advisor`, `oracle`, `reviewer`, and `scout` opt in; Scout resolves context from its requested `cwd`, while the others use the parent session cwd.

Model-specific research behind these caller-facing rules lives in `docs/prompting-*.md`. Each prompting doc covers one model or model family. Keep model names out of parent-facing tool guidelines unless the caller must choose or configure a model directly.

`buildPrompt` receives the resolved subagent model. Keep model selection in `modelPreferences`, model identity helpers in `@harness/models`, and model-specific prompt compilation inside the tool's `prompt.ts`.

Subagents default to the parent session cwd. If a subagent accepts an invocation-level `cwd` parameter, set `resolveCwd` in its `createSubagent` config so the subagent session and exposed tools use the same effective root.

## Commands

| Directory | Commands | Notes |
|---|---|---|
| Directory | Commands | Notes |
|---|---|---|
| `continue/` | `/continue` | Continue from a linked parent session |
| `copy-session-id/` | `/copy:session-id` | Copy session ID to clipboard |
| `copy-session-path/` | `/copy:session-path` | Copy session file path to clipboard |
| `proceed/` | `/proceed`, `/proceed status`, `/proceed help` | Resume the current session without sending prompt text to the LLM |
| `spawn/` | `/spawn [note]` | Create a linked child session |

## Hooks

| Directory | Purpose | Key files |
|---|---|---|
| `resource-loader/` | Append `.agents/AGENTS.local.md` (cwd only) to the system prompt; complements Pi's built-in `AGENTS.md`/`CLAUDE.md` discovery which does not consult `.agents/` | `index.ts`, `load.ts` |
| `provider-tweaks/` | Provider-specific tweaks; injects `x-session-id` on Anthropic requests, requests detailed reasoning summaries from GPT-5.6 Codex models, and adds session-affinity headers | `index.ts`, `anthropic.ts`, `openai-codex.ts` |
| `at-path-autocomplete/` | `@`-path autocomplete wrapper | Rewrites `@`-file completions to `./`-relative paths on insertion |
| `chrome/` | Header, footer, terminal title, notifications, auto-naming; footer shows cost and context | `hooks/`, `components/`, `lib/`, `native/` |
| `editor-stash/` | `ctrl+shift+s` stash/unstash of editor content | `index.ts`, `lib/` |
| `event-compat/` | Backwards-compatible event aliases | `index.ts` |
| `notifications/` | Canonical `ad:notify:*` producer plus terminal (OSC) and sound consumers | `index.ts`, `producer.ts`, `terminal.ts`, `sound.ts` |
| `protect-sessions-dir/` | Gate agent access to sessions directory | `gate.ts`, `session-gate-dialog.ts`, `bash-parser.ts` |
| `session-autocomplete/` | `@@` autocomplete for session references | `index.ts`, `provider.ts` |
| `session-name/` | Auto-name sessions | `index.ts` |
| `skill-autocomplete/` | `?` skill autocomplete; sends each inline skill as a rendered context message and retains skill names in user prose | `index.ts`, `expand.ts`, `render.ts` |
| `tps/` | Per-turn tokens-per-second telemetry emitted as `ad:tps:telemetry` for footer display and other consumers | `index.ts`, `utils.ts`, `types.ts` |
| `workspace-metadata/` | Record model-hidden hostname, canonical cwd, and Git remote metadata for new/forked sessions, and backfill existing sessions that lack it | `index.ts`, `helpers.ts`, `types.ts` |
| `zoxide-autocomplete/` | `@z:` project path autocomplete | `index.ts` |

## Tools

| Directory | Tool name | Notes |
|---|---|---|
| `advisor/` | `advisor`, `resume_advisor` | Zero-shot strategic advisor for hard decisions, stuck work, risk review, and pre-completion second opinions; hidden from the active tools when the session model matches the gpt-5.6/gpt-6 families (`utils.ts`), same enable/disable pattern as `look_at` |
| `ask-user/` | `ask_user` | Sequential structured input dialogs |
| `bash/` | `bash` | Adds `cwd` while preserving Pi's session environment, spawn hooks, and sanitization |
| `edit/` | `edit`, `apply_patch` | Model-aware edit tool. Routes Codex/GPT models to a queued `apply_patch` (V4A freeform patch, replacing `edit`+`write`), Kimi K2.7 Code to a queued `edit` with `old_string`/`new_string`, and everyone else to the native JSON `edit` with capability-aware constrained sampling |
| `find/` | `find` | Adds `glob`, blocked paths |
| `find-sessions/` | `find_sessions` | Session search or recent-session browsing via `@harness/session-store`; reports match provenance |
| `get-current-time/` | `get_current_time` | Passthrough |
| `list-sessions/` | `list_sessions` | Session directory listing via `@harness/session-store` |
| `look-at/` | `look_at` | Zero-shot vision subagent; BMP files are converted to PNG before vision analysis |
| `oracle/` | `oracle`, `resume_oracle` | Zero-shot senior technical advisor; hidden from the active tools when the session model matches the gpt-5.6/gpt-6 families (`utils.ts`), same enable/disable pattern as `look_at` |
| `read/` | `read` | Passthrough; BMP images are converted to PNG before upstream handling |
| `read-session/` | `read_session` | Zero-shot past-session extractor |
| `read-url/` | `read_url` | URL fetch with handler chain and preview |
| `reviewer/` | `reviewer`, `resume_reviewer` | Zero-shot formal code-review subagent; accepts optional `cwd` so review commands and file reads run in the target repo |
| `scout/` | `scout`, `resume_scout` | Zero-shot local codebase researcher; grep/find run with capped output readers |

## Development

Uses pnpm workspaces. Nix environment available via `flake.nix`.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm evals
pnpm evals:ui
```

## Extension Gist releases

`scripts/extension-gists.json` is the opt-in release manifest for standalone extension Gists. Each entry records its package metadata, runtime executable requirements, visibility, and stable Gist ID. A missing Gist ID means the first publish creates the Gist and writes its ID back to the manifest; later publishes update that Gist.

The Nushell release script builds each selected extension as `index.js` and each declared `@harness/*` workspace package as a separate flat ESM file. Pi runtime packages remain optional peer dependencies so Pi can supply its own compatible runtime. The build fails if it reaches third-party `node_modules`, an undeclared workspace import, a non-Pi external package, or known repository-relative runtime resources. Generated packages contain the flat JavaScript files and `package.json` under `dist/extensions/`.

```sh
# Build every manifest entry, or one entry by path.
pnpm extensions:build
pnpm extensions:build hooks/skill-autocomplete

# Preview, create, or update Gists using the current gh login.
pnpm extensions:publish --dry-run
pnpm extensions:publish hooks/skill-autocomplete
```

Review and commit `scripts/extension-gists.json` after a first publish records a new Gist ID. Add only extensions that can run without repository-relative assets or external runtime npm dependencies. Runtime executables such as `git`, `tmux`, or `zoxide` must be declared in the manifest.

Workspace packages:

| Directory | Package | Description |
|---|---|---|
| `packages/agent-kit/` | `@harness/agent-kit` | Subagent framework used by harness tools and hooks; ranks the model roster and fails over to the next entry on pre-start provider failures, returns nested model usage for Pi session accounting, and fresh runs can replace the model preference roster for evals |
| `packages/audio-player/` | `@harness/audio-player` | Shared alert sound paths and best-effort audio playback with binary fallback |
| `packages/completion/` | `@harness/completion` | Completion logic |
| `packages/events/` | `@harness/events` | Shared event names and event payload types |
| `packages/image-formats/` | `@harness/image-formats` | Image MIME detection and format conversion |
| `packages/models/` | `@harness/models` | Model identity helpers (`ModelIdentity`, `knownModelFamily`, `modelKey`) |
| `packages/session-store/` | `@harness/session-store` | Session directory access, Sesame search, and listing |
| `packages/session-tools/` | `@harness/session-tools` | Pi-agnostic session entry indexing, branch/tree traversal, and bounded read-session helpers |
| `packages/subagent-models/` | `@harness/subagent-models` | Global subagent model roster config (`settings/subagent-models.json`), async loader, and disabled-subagent registration helper |
| `packages/test-utils/` | `@harness/test-utils` | Shared Vitest/Pi extension test harness utilities |
| `packages/ui/` | `@harness/ui` | Shared TUI components/helpers |
| `packages/utils/` | `@harness/utils` | Shared generic utilities |

## Instance isolation

To run multiple harness instances on the same machine, override these env vars per instance (alongside Pi's own `PI_CODING_AGENT_DIR`, which already isolates everything under the agent dir):

| Variable | Default | Used by |
|---|---|---|
| `HARNESS_DATA_HOME` | `$SESAME_DATA_DIR` or `~/.local/share/sesame` | Sesame session-search SQLite index (`packages/session-store/db.ts`) |

## Custom header

The startup header (`hooks/chrome/components/header.ts`) shows the logo in collapsed mode and a curated list of harness commands, shortcuts, and completion providers when expanded. Extensions register these entries by listening to `AD_HEADER_COLLECT_EVENT` and emitting the matching `AD_HEADER_REGISTER_*` event from `@harness/events`. When adding a new `registerShortcut`, `registerCommand`, or autocomplete provider, ask whether it should be added to the header.

## Notes

- This repo is private Pi harness infrastructure first. Not every package here is intended to be published as a standalone package.
- Keep repository-level docs focused on this Pi harness. Feature-specific details belong next to the feature only when those docs are actively maintained.
ckage here is intended to be published as a standalone package.
- Keep repository-level docs focused on this Pi harness. Feature-specific details belong next to the feature only when those docs are actively maintained.
