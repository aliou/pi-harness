# Prompting GPT-6 Sol and Luna

GPT-6 comes in three models: Astra, Sol, and Luna. OpenAI publishes one set of prompting guidance for the whole family. That guidance describes behavior seen on Astra and asks you to check it against your own model and workload. This guide covers Sol and Luna, the two used here.

## Model profile

- GPT-6 Sol (`gpt-6-sol`): built for complex coding and agentic workflows, and demanding reasoning that does not need Astra's full depth. Knowledge cutoff: April 20, 2026.
- GPT-6 Luna (`gpt-6-luna`): OpenAI's most efficient model for focused, high-volume tasks such as extraction, classification, summaries, and quick answers. Knowledge cutoff: May 18, 2026.
- Context: 1,050,000 tokens (922,000 max input). Max output: 128,000 tokens. Text and image input.
- Reasoning effort: `none`, `low`, `medium` (default), `high`, `xhigh`, `max`. Astra does not support `none`; Sol and Luna do.
- Tools: use the Responses API for reasoning with tools. In Chat Completions, Sol and Luna call functions only at `reasoning_effort: "none"`.
- Parameters: when effort is not `none`, remove `temperature`, `top_p`, and `top_logprobs`.

## Behavior to plan for

OpenAI lists five traits of the family:

- **Initiative:** the model is more likely than GPT-5.6 to stop and ask a clarifying question when more input could change the result. It also asks non-blocking questions while working.
- **Instruction following:** it follows long instructions better, but is more sensitive to text in skills and files such as `AGENTS.md`. Unclear or conflicting guidance can make it pause early.
- **Writing style:** it tends toward detailed, formatted answers with lists, tables, and Markdown, and may reuse stock phrases.
- **Delegation:** it may delegate to subagents less often than wanted.
- **Testing:** on coding tasks it tests thoroughly, sometimes more broadly than a small change needs.

## Independent findings

Amp ran GPT-6 Sol against Claude Opus 5.5 on the day both shipped. In their evals, Sol scored about the same as GPT-5.6 Sol at half the cost. In real work it was "much more jagged: strong on one task, off on the next", so Amp kept Opus 5.5 as its default. When Sol backs a role that must be reliable on every call, check the spread of results, not only the mean.

## Write the task as a finished-result contract

State the outcome, the context that matters, the constraints, what counts as done, and the answer shape. Say what "finished" means. A request to stop for review after a first pass pulls the model toward an early stop.

When the model should proceed without asking, say so and say which assumptions it may make:

```text
Infer intent and scope from the instructions and context. When information is missing,
make the simplest valid assumption, label it, and continue. Ask only when no useful
result is possible without the answer.
```

Describe permission boundaries in plain terms. Strong "always ask first" language written for older models can be taken too literally. The model may then stop where you wanted it to continue.

## Keep inherited instructions short and non-conflicting

Audit skill files, `AGENTS.md`, and reused prompts for rules that no longer protect anything. Point to docs by context ("use `database.md` for schema changes") instead of requiring reads before every edit. When instruction files are in context, state the priority: the task prompt's instructions win over guidance in skills or project files.

## Shape the answer explicitly

If the output should be prose, say so. OpenAI's suggested wording asks for concise paragraphs that each develop one idea, lists only for parallel or sequential items, plain language, active voice, and the main point stated early. For machine-read output, use Structured Outputs. They constrain shape, not correctness.

## Choose effort per role

Treat effort as runtime configuration, not prompt text. Start at the default `medium` and raise it only when evals show a gain. Luna suits `none` or `low` for deterministic, high-volume work. Use higher effort for harder edge cases. When one conversation needs a different effort, use a `configuration_update` input item instead of changing request-level effort. This keeps the cached prefix.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Stops to ask a question the brief already answers | Say which assumptions it may make and when a question is allowed. |
| Pauses because of a skill or `AGENTS.md` rule | State that task instructions take precedence and remove conflicting rules. |
| Heavily formatted answer | Specify prose or the exact answer shape. |
| Runs more tests than the change needs | Scope testing to the change. |
| Stops after the first implementation | Define completion before starting. |
| 400 error on tool calls in Chat Completions | Use Responses, or set effort to `none` in Chat Completions. |

## Sources

- OpenAI, [Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model)
- OpenAI, [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
- OpenAI, [GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna)
- OpenAI, [GPT-6 Sol model page](https://developers.openai.com/api/docs/models/gpt-6-sol)
- OpenAI, [Introducing GPT-6 Sol and Luna](https://openai.com/index/introducing-gpt-6-sol-and-luna/)
- Amp, [Opus 5.5: Why not GPT-6 Sol?](https://ampcode.com/news/opus-5.5)
