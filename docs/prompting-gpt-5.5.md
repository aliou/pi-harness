# Prompting GPT-5.5

GPT-5.5 is OpenAI's frontier model for complex professional work, coding, and tool-using agents. Treat it as a new model family to tune, not as a drop-in replacement for an older GPT prompt stack.

## Model profile

- Best fit: difficult engineering, planning, analysis, tool-heavy workflows, and high-quality review where a clear outcome can be verified.
- Context: 1.05M tokens; 128K maximum output. Inputs above 272K tokens have long-context pricing, so retrieve and compact deliberately.
- Modalities: text and image input; text output. The Responses API supports tools, structured outputs, and agent-oriented features.
- Reasoning: `none`, `low`, `medium`, `high`, and `xhigh`; `medium` is the API default.
- Behavioral profile: agent-shaped, interactive, and highly steerable. It does not reliably recover an unstated requirement from a vague task.

Amp's internal evaluation found `medium` a useful default for normal deep engineering work and `xhigh` the quality leader. It also found `high` more expensive and worse than `medium` on one benchmark, so never treat a higher effort level as automatically safer.

## Write an outcome-first prompt

Use the structure of a good engineering ticket. Give the desired outcome, what good means, constraints, relevant evidence, how success will be checked, and the final response shape. Let GPT-5.5 choose the procedure unless the procedure is part of the product contract.

```text
Outcome: make webhook delivery idempotent by provider event ID.
Good: a repeated delivery creates no second invoice; successful and retryable paths stay intact.
Constraints: do not redesign billing or change the provider contract.
Verification: add a focused regression test and run the billing test suite.
Final: summarize the change, validation, and any unresolved risk.
```

Use the prompt to distinguish diagnosis, options, recommendation, plan, and implementation. State whether the model should stop after its analysis, may make local edits, or needs permission before external or destructive actions. For product or design tasks, write the intended judgement down; the model can execute a clear specification extremely well but cannot reliably infer the missing decision.

Avoid default process scripts such as "inspect, plan, edit, test" in every task. Keep enduring behavior in system instructions, tool descriptions, and repository guidance. Add process requirements only when they materially protect the task, for example requiring a reproduction test before changing concurrency code.

## Reasoning and output controls

Start with `medium` for normal complex work. Use `low` for narrow changes with cheap verification. Use `xhigh` for difficult debugging, broad refactors, high-blast-radius changes, or cases where failure is expensive. Evaluate `high` and `xhigh` against representative tasks instead of assuming a monotonic quality increase. In Amp's 102-task internal SWE eval, `high` cost more than `medium` and passed fewer tasks (50 vs 54). `xhigh` led on quality (55) at almost twice the cost of `medium`. Amp also runs GPT-5.5 with no reasoning for its Librarian code-search subagent: at the same quality it was about 3x faster and 43% cheaper than Sonnet 4.6, and it fired about 8 tool calls in parallel per turn.

Amp's GPT-5.5 system prompt treats guidance files and skills as "constraints and shortcuts, not invitations to expand the task". At higher reasoning, GPT-5.5 reads every relevant guidance file and tries to satisfy every rule it finds.

Set reasoning at runtime; do not ask the model to "think harder" or reveal hidden reasoning. Request conclusions, evidence, assumptions, and uncertainty. Use `text.verbosity` or a concrete response shape when the API supports it instead of repeating generic brevity rules. Generic "be concise" instructions can cut required caveats; prioritize conclusion first, required evidence, then optional context.

## Tool and agent design

Give each tool a crisp, operational description: what it reads or changes, its authority boundary, expected arguments and output, and when it must be used. GPT-5.5 is stronger with tools but still needs a reason to call them for fresh or repository-specific facts.

```text
Use repository search and file reads before making source-specific claims. Cite the
path and symbol that support each root-cause claim. Do not run state-changing commands
until the evidence supports that action.
```

Parallelize independent reads and searches. After a write, require the model to report what changed, where, and the focused validation performed. Scale validation to blast radius: no test for a wording-only answer, a focused check for a local patch, and a broader suite for shared behavior.

For a long-running experience, a short visible update before a multi-step tool phase reassures users without narrating every call. Explain only meaningful phase changes or new information. Give the agent an explicit completion condition so it does not stop at a plan after enough evidence and tools are available.

## Context, compaction, and structured work

For long inputs, identify the relevant sections, dates, jurisdictions, files, entities, and precision requirements. Request source anchors for detailed claims. Do not use a large context window as a substitute for retrieval and prioritization.

Use response compaction at meaningful milestones in long, tool-heavy workflows. Preserve the task contract and important state when resuming; do not inspect or depend on compacted internals. Keep prompt changes small during migration so results reflect a model change rather than a changed task.

For extraction, provide an exact schema, distinguish required and optional fields, and define the missing-value behavior. Ask it to use `null`, `not found`, or a typed uncertainty rather than guessing. For high-stakes outputs, request a short evidence and assumptions review before finalizing.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Correct execution of the wrong product intent | State the product decision, success criteria, and exclusions explicitly. |
| Excess procedural narration or duplicated rules | Move durable rules to the harness and retain only task-specific constraints. |
| Insufficient fresh evidence | Require the specific tool, source anchor, and stop condition. |
| Higher spend without better result | Re-baseline at `medium`; only escalate after representative evaluation. |
| Vague final answer | Specify diagnosis, evidence, recommendation, implementation status, and risks. |
| Tool loop loses relevant history | Compact after milestones and carry forward the verified task state. |

## Sources

- OpenAI, [GPT-5.5 model documentation](https://developers.openai.com/api/docs/models/gpt-5.5)
- OpenAI, [GPT-5.5 system card](https://openai.com/index/gpt-5-5-system-card/)
- OpenAI, [Using GPT-5.5](https://developers.openai.com/api/docs/guides/latest-model)
- Amp, [GPT-5.5 model card](https://ampcode.com/models/gpt-5.5)
- Amp, [A faster Librarian](https://ampcode.com/news/a-faster-librarian)
- Simon Willison, [GPT-5.5 prompting guide](https://simonwillison.net/2026/apr/25/gpt-5-5-prompting-guide/)
