---
name: find-skills
description: Discover skills beyond those shown in the session prompt by listing every configured skill library and its skills. Use when the available skills are not enough, or to browse which skill libraries are configured.
---

# Find Skills

The session prompt only lists a subset of available skills. When you need more, discover them from the same source the `?` autocomplete uses: the completion config at `$PI_CODING_AGENT_DIR/settings/completion.json` (default `~/.pi/agent/settings/completion.json`).

## List all skills

Resolve `list-skills.mjs` against this skill's directory (the parent of this `SKILL.md`) and run it:

```sh
node <this-skill-dir>/list-skills.mjs
```

The script prints every skill, grouped by library and prefixed with the library's label, each with its description and the absolute path to its `SKILL.md`. Skills listed under the `[pin]` block come from the `pinned` config and shadow same-named skills in the roots, matching what pi resolves. It validates the config and exits non-zero with a clear message if a library entry is not an object with non-empty `path` and `label`.

## Read a skill

Each listed skill ends with an absolute path to a `SKILL.md`. Read that path to load the skill. When a skill references a relative path, resolve it against that skill's own directory (the parent of its `SKILL.md`).

## Config format

Each library is an object with two required fields:

```json
{
  "skillsRoots": [
    { "path": "~/skills", "label": "personal" },
    { "path": "~/code/src/skill-library", "label": "library" }
  ]
}
```

- `path` — directory containing skill folders. `~` is expanded to the home directory.
- `label` — short name shown as a prefix on every skill from this library.

Skills can also be pinned so they shadow same-named skills from every root. Each entry is a path to a single skill directory (containing `SKILL.md`); `~` is expanded:

```json
{
  "pinned": ["~/.local/share/agents/skill-library/agent-browser"]
}
```

Pinned paths that are not skill directories are silently skipped, and pinned skills win name collisions against all roots.

Bare strings, missing `label`, or missing `path` are rejected.
