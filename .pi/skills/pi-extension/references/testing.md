# Testing Extensions

Extensions are tested manually by running pi in a test directory with the extension loaded. Each test scenario gets its own directory with the necessary config, fixture files, and a prompt template to trigger the test.

## Test Directory Structure

```
<test-root>/
├── 01-scenario-name/
│   ├── .pi/
│   │   ├── extensions/
│   │   │   └── <extension>.json    # Project-scoped extension config (if needed)
│   │   └── prompts/
│   │       └── run-test.md          # Prompt template to trigger the test
│   ├── settings.json                # Pi settings with only relevant extensions (if needed)
│   ├── README.md                    # Human-readable description of what to test
│   └── <fixture files>              # Any files the test needs (.env, .key, etc.)
├── 02-another-scenario/
│   └── ...
```

## Setting Up a Test Directory

If the user does not provide a test directory, create one at `~/tmp/<date>-<extension>-test/`. Number each scenario directory with a zero-padded prefix so they sort naturally.

```bash
mkdir -p ~/tmp/2026-01-27-guardrails-test/01-defaults
```

## What Goes in Each Scenario

### Extension Config (`.pi/extensions/<name>.json`)

The project-scoped config file for the extension under test. This is the main thing that varies between scenarios. Only include the fields relevant to the scenario - let defaults handle the rest.

```json
{
  "features": {
    "preventBrew": true
  }
}
```

### Fixture Files

Any files the scenario needs to exist on disk. For example, if testing env file protection, create a `.env` file. If testing file pattern matching, create files with the relevant extensions.

### Prompt Template (`.pi/prompts/run-test.md`)

A prompt template that triggers the test. The user runs `/run-test` in pi to execute the scenario. The prompt should:
- State what is being tested
- List specific commands to run, one by one
- Include expected outcomes in parentheses so the tester knows what to look for

```markdown
---
description: Run guardrails test scenario (defaults)
---
Test the guardrails extension with default config. Run these commands one by one and report what happens:

1. Run `brew install jq` (should NOT be blocked - preventBrew is off by default)
2. Read the `.env` file in this directory (should be blocked)
3. Run `rm -rf /tmp/test` (should show a dangerous command confirmation dialog)
```

Name the prompt `run-test.md` for single-prompt scenarios. If a scenario has multiple prompts, use descriptive names: `run-test-hooks.md`, `run-test-commands.md`.

### Settings File (`settings.json`)

Only include a `settings.json` when you need to control which extensions are loaded or override pi settings for the test. This is useful for:
- Testing an extension in isolation (only load that extension)
- Testing interaction between specific extensions
- Reproducing a minimal environment

```json
{
  "packages": [
    {
      "source": "git:file:///path/to/pi-extensions",
      "extensions": ["extensions/guardrails", "extensions/presenter"]
    }
  ]
}
```

Most scenarios do not need this. Pi will load extensions from your global settings.

### README.md

A human-readable description of the scenario for reference. Not read by pi. Include what config is set, what to try, and what to expect.

## Running Tests

To test a scenario:

```bash
cd ~/tmp/2026-01-27-guardrails-test/01-defaults
pi
```

Then type `/run-test` and press enter.

## Scenario Design Guidelines

- **One concern per scenario.** Test a single config change or feature toggle. Do not combine unrelated features in one scenario.
- **Include both positive and negative cases.** Test that blocked things are blocked AND that allowed things are allowed.
- **Use realistic commands.** The agent will actually try to run the commands, so use safe targets (`/tmp/`, `./fake-dir`) for destructive operations.
- **Number scenarios.** Use `01-`, `02-`, etc. so they sort in a logical order: defaults first, then feature toggles, then edge cases.
- **Keep configs minimal.** Only override the fields relevant to the scenario. This makes it clear what is being tested and relies on defaults for everything else.
