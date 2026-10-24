# pi-harness

My personal harness around [Pi](https://github.com/badlogic/pi-mono/) for coding-agent work.

This repo is a pnpm workspace. Internal shared dependencies live in `packages/` under the `@harness/*` scope and are private to this repository.

## Documentation maintenance

Keep this file current when adding, removing, moving, or materially changing commands, hooks, tools, extensions, packages, or shared architecture. When adding new content or changing existing behavior, update the closest relevant documentation in the same change. Feature-specific docs belong next to that feature only when they are actively maintained.

## Structure and placement

New functionality goes in `commands/<name>/` (slash commands), `hooks/<name>/` (event-driven behavior, UI chrome, autocomplete, lifecycle, background observers), `tools/<name>/` (agent-callable tools), `packages/<name>/` (shared internal `@harness/*` code), or `skills/<name>/` (shipped skills, declared under `pi.skills`). Avoid cross-imports between `commands/`, `hooks/`, and `tools/`; share code by vendoring it locally if tiny, adding it to an existing `packages/*` package, or creating a new one when it is a distinct shared concern.

Every extension entry point is `export default function(pi: ExtensionAPI)`, calling `pi.registerCommand(...)`, `pi.registerTool(...)`, or `pi.on(...)` directly — no wrapper functions. Within a command, hook, or tool directory, every `pi.*`/`ctx.*` call lives in `index.ts`; other files contain only pure functions, types, schemas, components, or renderers.

## Tool result contract

Every tool the main agent can call follows Pi's tool result contract, so `codemode` scripts get data and permission extensions get honest hints:

- Declare `outputSchema` (TypeBox) and always return matching `structuredContent`, typed with `Static<typeof schema>`. Pi does not validate it at runtime. It must be JSON: build from type aliases or fresh literals and drop `undefined` fields with `withoutUndefined` from `@harness/utils`.
- `structuredContent` carries the result data, not the model-facing view. It is not saved in the session, so return the full data up to 1 MiB when `content` is a truncated preview, stating the cap in the schema field description.
- Report a failure that still carries data with `isError: true` and `structuredContent`, not a normal result whose text is an error. Throw for failures without data.
- Set `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). Missing hints mean "may be destructive, open world".
- Test with `expectStructuredOutput` from `@harness/test-utils/structured-output`. Only tools the main agent can call follow the contract; tools registered inside subagent sessions do not.

Subagent tools that spawn a subagent follow a different layout under `tools/subagents/<name>/`: a `register<Name>(pi)` entry function in `index.ts`, `prompt.ts` for the system prompt, and `tools/` visible only inside the subagent. Shared framework code is `@harness/agent-kit`.

Each subagent hardcodes its roster in its `createSubagent` call as the single pi-rig virtual alias `agents/<name>`, so physical model choice and usage-aware routing live in pi-rig, not here. Subagents have no roster-level `enabled` flag; parent-model gates may still hide their tools. Attempt order is roster order; ranking and failover mechanics live in `packages/agent-kit/` — read them before changing roster behavior.

Before changing child model or resource loading, read `packages/agent-kit/resources/virtual-models.ts` and `packages/agent-kit/models/model-runtime.ts`. Discover routing resources from the parent cwd without installing missing packages; require the enabled pi-rig routing extension and fail explicitly when it is unavailable. Keep routing pins scoped to the child session. The caller-facing failover rules that must hold regardless of implementation: only failures before the first streamed token advance to the next roster entry (once output has streamed, a failure is fatal — a fresh session on another model would silently drop what the caller already saw); context overflow, aborts, prompt-build failures, and clean-but-empty completions are never retried; resumed runs never fail over, because the pinned model owns the session history.

Subagents are zero-shot: only their final response is returned to the parent, and a run with no final answer fails the parent tool call. Make each subagent call self-contained. Answers always arrive inside a `<subagent-output agent="…">` block; a config may set `disclaimer` to add harness-authored `<disclaimer>` blocks before and/or after it. The answer text itself is never rewritten, `structuredContent.response` carries the framed text without the resume footer, and the TUI shows the notices only when the result is expanded. Advisory and review subagents prefer outcome-first prompts (outcome, what good means, constraints, verification, evidence, desired shape); research and extraction subagents prefer narrow scope and requested evidence over inference. Model-specific research and compatibility constraints live in `docs/prompting-*.md` — read the matching doc before changing a subagent's prompt or model roster. Sol 6.1 requires at least `low` reasoning and Responses for tools; use Luna when a role needs thinking `off`. `buildPrompt` receives the resolved subagent model: keep model selection in `modelPreferences`, model identity helpers in `@harness/models`, and model-specific prompt compilation inside the tool's `prompt.ts`. Keep model names out of parent-facing tool guidelines unless the caller must choose or configure a model directly.

Edit routing and the `advisor`, `oracle`, and `look_at` visibility gates resync before every LLM call through the `context` event, because an alias's routing state first appears mid-run. Edit routing decides `latest/*` and `fast/*` aliases from the alias id immediately (GPT aliases get `apply_patch` in place of `edit` and `write`, Kimi aliases the Kimi `edit` schema); other selections, including `agents/*`, use `effectiveModelIdentity` from `@harness/models`. The advisory gates hide `advisor`/`oracle` and their resume tools for GPT-5.6 and GPT-6 physical models, falling back to the alias id only before routing state exists. The `look_at` gate checks the effective model's image capability through `resolveEffectiveModel`; before that resolves, aliases pinning a vision-capable family hide it and unresolved mixed aliases keep the current visibility.

Code-reading subagents can opt into project context through `resolveAgentsFiles`; agent-kit marks those files as factual reference context, so their implementation and workflow directives do not override the subagent's assigned role. Subagents default to the parent session cwd; if a subagent accepts an invocation-level `cwd` parameter, set `resolveCwd` in its `createSubagent` config so the subagent session and exposed tools use the same effective root.

## Development

pnpm workspaces; Nix environment via `flake.nix`. Unit tests use `memfs` for filesystem fixtures via `tests/vitest.setup.ts`; subprocesses cannot read memfs, so integration tests that spawn processes use real temporary host directories. Read `tests/README.md` and follow its conventions before writing tests.

## Extension Gist releases

`scripts/extension-gists.json` is the opt-in release manifest for standalone extension Gists; a missing Gist ID is created on first publish and written back to the manifest — review and commit the manifest after a first publish. `pnpm extensions:build` builds each entry as flat ESM; the build fails on third-party `node_modules`, undeclared workspace imports, non-Pi externals, or repository-relative runtime resources. Runtime executables such as `git`, `tmux`, or `zoxide` must be declared in the manifest. Add only extensions that can run without repository-relative assets or external runtime npm dependencies.

## Instance isolation

To run multiple harness instances on the same machine, override `HARNESS_DATA_HOME` (default `$SESAME_DATA_DIR` or `~/.local/share/sesame`), which isolates the Sesame session-search SQLite index in `packages/session-store/`, alongside Pi's own `PI_CODING_AGENT_DIR`.

## Notes

- This repo is private Pi harness infrastructure first. Not every package here is intended to be published as a standalone package.
- Keep repository-level docs focused on this Pi harness. Feature-specific details belong next to the feature only when those docs are actively maintained.
