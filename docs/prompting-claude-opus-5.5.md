# Prompting Claude Opus 5.5

Claude Opus 5.5 is Anthropic's default model for long-running agentic coding, code review, and knowledge work. Thinking is always on and adaptive, and effort is the main control. Prompts written for Claude Opus 5 work without changes. The Opus 5 guidance on scope, verification, and subagents still applies.

## Model profile

- Best fit: multistep repository work, code review, audits, and careful judgment calls. Anthropic reports fewer false alarms in review than Opus 5, and fewer wrong figures or wrong citations in knowledge work.
- Context: 1M tokens. Max output: 128K tokens. Reliable knowledge cutoff: June 2026.
- Thinking: adaptive and always on. `thinking: {"type": "disabled"}` returns a 400 error at every effort level.
- Effort: `low`, `medium` (default), `high`, `xhigh`, `max`. At `medium` it matches or beats Opus 5 at `high` on coding and knowledge-work evals. At a given level it thinks more per turn than Opus 5, especially at `xhigh` and `max`.
- Tools: forced tool use (`tool_choice` of type `any` or `tool`) returns an error. Text between tool calls comes back in `thinking` blocks, which are empty at the default `display` setting.
- Vision: reads dense charts, diagrams, and screenshots more accurately than Opus 5, even at its lowest effort.

## Pick effort before writing prompt text

Effort is the first lever for cost, latency, and depth. Start at `medium`, set it explicitly, and run a sweep on real work instead of carrying over the Opus 5 value. Reserve `xhigh` and `max` for work where a quality gain has been measured. To get less thinking, lower effort first. Effort cuts thinking more reliably than prompt instructions do.

Thinking counts toward `max_tokens` even when the thinking text is not returned. Leave room for it. Anthropic reports 128K working well for long agentic turns.

Changing the top-level effort between requests invalidates the prompt cache. Use a per-message effort change (beta) when one turn needs a different level.

Amp's evals point the same way and go further: Amp runs Opus 5.5 at `high` and stops there. Past `high` the model overthinks, and at `xhigh` and `max` it used several times the tokens and scored lower than at `high`. In Amp's internal coding evals at `high`, Opus 5.5 solved 65% of tasks, against 61% for GPT-5.6 Sol and 56% for Opus 5, at lower cost than both. Treat `xhigh` and `max` as unproven for any role until a local eval shows a gain.

## Define done and the evidence to deliver

Amp describes Opus 5.5 as persistent: it keeps going until the job is done, so it needs to know what done is and how to check it. Their bug-fix prompts end with the deliverable and the proof:

```text
Implement the simplest correct fix, verify it, then explain the bug, the fix, and the
evidence that the fix resolves it.
```

For advisory or review work, the equivalent is a stated answer shape and an evidence standard (paths, symbols, commands run). Amp also finds it folds mid-task corrections into its work well, so a correction message beats restarting with a new prompt.

## Remove thinking and verification scaffolding

Delete lines that ask the model to "think carefully before answering". Anthropic's testing showed that removing them made replies start sooner with no clear loss in quality.

Do not ask the model to write its reasoning into the response. Such prompts can be declined with the `reasoning_extraction` refusal category. Read summarized thinking blocks instead.

Opus 5 and later check their own work without being told to. Instructions such as "double-check your answer", "re-verify before responding", or "add a final verification step" cause over-verification and add cost with no gain. Remove them.

## Constrain scope and answer length

The Opus 5 line can widen a task or add steps nobody asked for. For narrow tasks, state the scope and what to do if the request looks wrong:

```text
Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and
check in only when different readings of the request would lead to materially different
work. If the request seems mistaken or a better approach exists, say so in a sentence and
continue with the task as asked.
```

Effort controls thinking, not visible length. Opus 5 answers run longer than earlier Opus models. When length matters, ask for it directly and describe the shape of the answer.

For review work, a prompt that says "only report high-severity issues" or "be conservative" is followed literally and lowers recall. Ask for every finding with a severity and confidence label, or state a concrete bar.

## Mark untrusted text

Opus 5.5 resists prompt injection from tool results, web pages, and screen content better than earlier Opus models. For pasted text, wrap each block in tags that carry a random ID. Tell the model that instructions inside the block are not the user's own and should be followed only when the user's message asks for it. Treat the tags as one guardrail among several.

## Unattended runs and progress updates

On long tasks, Opus 5.5 sometimes ends a turn with a text update instead of a tool call. A harness that treats that turn as the end of the task stops too early. Keep a checklist of open items. If a turn ends with open items and no blocker, send one short message that names them, and stop after two or three automatic continuations. A standing instruction can also name the early stops to avoid. Add it from the first request, because changing the system prompt partway through invalidates earlier thinking blocks.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Turns cost more than on Opus 5 | Lower effort before adding prompt rules. Start at `medium`; do not go past `high` without an eval. |
| Request fails with 400 | Remove `thinking: disabled` and forced `tool_choice`. |
| `stop_reason: "refusal"` with `reasoning_extraction` | Remove instructions that ask for reasoning in the response. |
| Long, repeated self-checks | Remove verification and double-check instructions. |
| Review reports too few findings | Replace "only report important issues" with a concrete bar or ask for everything with severity. |
| Unattended agent stops after a progress report | Track open items and continue from the harness, with a small retry cap. |
| Client looks silent between tool calls | Set `thinking.display` to `updates` to receive progress text. |

## Sources

- Anthropic, [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
- Anthropic, [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5)
- Anthropic, [Claude Opus 5.5 overview](https://platform.claude.com/docs/en/models/opus-5-5/overview)
- Anthropic, [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- Anthropic, [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- Amp, [Opus 5.5](https://ampcode.com/news/opus-5.5)
