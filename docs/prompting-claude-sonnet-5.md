# Prompting Claude Sonnet 5

Claude Sonnet 5 is Anthropic's fast mid-tier model for coding and agentic work. It follows instructions literally, respects effort strictly, and thinks by default. Prompts written for Sonnet 4.6 work out of the box. Tune review prompts and effort first.

## Model profile

- Best fit: coding, agentic search, structured extraction, and pipelines that need predictable behavior.
- Context: 1M tokens. Max output: 128K tokens. Reliable knowledge cutoff: January 2026.
- Thinking: adaptive thinking is on by default. `thinking: {"type": "disabled"}` turns it off. Manual `budget_tokens` returns a 400 error.
- Effort: `low`, `medium`, `high` (default), `xhigh`, `max`. `medium` is roughly Sonnet 4.6 at `high`. Use `xhigh` for the hardest coding and agentic tasks.
- Sampling: a non-default `temperature`, `top_p`, or `top_k` returns a 400 error.
- Tokenizer: about 30% more tokens than Sonnet 4.6 for the same text. Revisit `max_tokens`.

## Write literal, fully scoped instructions

Sonnet 5 does not generalize an instruction from one item to the next, and it does not infer requests you did not make. This literalism is most visible at lower effort. When an instruction applies broadly, say so: "Apply this to every changed file, not just the first one."

Give the full task, intent, and constraints in the first message. Underspecified requests spread over several turns cost more tokens and sometimes lower quality.

## Calibrate effort instead of prompting around it

At `low` and `medium`, the model scopes its work to exactly what was asked. On moderately complex tasks at `low`, it can under-think. Raise effort to `high` or `xhigh` before adding prompt text. If effort must stay low for latency, add a targeted line such as "This task involves multistep reasoning. Think carefully through the problem before responding."

Higher effort also means more tool use. With thinking disabled, the model reaches for tools less often. Add an explicit nudge if tool calls matter in that mode.

At `high` and above, leave headroom in `max_tokens`. A tight budget can produce a reply that is almost all thinking, followed by a truncated answer with `stop_reason: "max_tokens"`.

## Review prompts: set the reporting bar explicitly

A review prompt that says "only report high-severity issues", "be conservative", or "don't nitpick" is followed more faithfully than on earlier models. The model still finds the bugs but reports fewer of them, so recall drops even though bug-finding improved.

For a finding stage that feeds a separate filter, ask for coverage:

```text
Report every issue you find, including ones you are uncertain about or consider
low-severity. For each finding, include your confidence level and an estimated severity
so a downstream filter can rank them.
```

For a single-pass review, make the bar concrete instead of qualitative:

```text
Report any bugs that could cause incorrect behavior, a test failure, or a misleading
result; only omit nits like pure style or naming preferences.
```

## Output length and progress updates

Response length follows task complexity, so answers are short on lookups and longer on open-ended analysis. For tighter output, ask for concise, focused responses. Positive examples of the wanted style work better than lists of things to avoid.

Sonnet 5 gives regular progress updates on long traces. Remove old scaffolding such as "summarize progress every 3 tool calls".

## Common failure modes

| Symptom | Response |
| --- | --- |
| 400 error on migration | Remove `temperature`/`top_p`/`top_k` and `budget_tokens`. |
| Instruction applied to one item only | State the scope explicitly. |
| Shallow reasoning at `low` | Raise effort; add a targeted reasoning line only if effort must stay low. |
| Review recall drops | Replace qualitative filters with a concrete bar, or ask for all findings with confidence and severity. |
| Truncated answer after long thinking | Raise `max_tokens` or lower effort. |
| Too few tool calls with thinking off | Add an explicit tool-use nudge or turn thinking back on at lower effort. |

## Sources

- Anthropic, [Prompting Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5)
- Anthropic, [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- Anthropic, [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- Anthropic, [Claude Opus 5.5 overview: model comparison table](https://platform.claude.com/docs/en/models/opus-5-5/overview)
