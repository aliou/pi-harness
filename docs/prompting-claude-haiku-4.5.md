# Prompting Claude Haiku 4.5

Claude Haiku 4.5 is Anthropic's fastest and cheapest current model. Anthropic suggests it for subagents, high-volume work, and latency-sensitive tasks. It is older than the rest of the current lineup and uses manual extended thinking, not adaptive thinking or effort.

## Model profile

- Best fit: short, scoped tasks, parallel subagents, quick visual reads, and classification or extraction where speed and cost matter.
- Context: 200K tokens. Max output: 64K tokens. Reliable knowledge cutoff: February 2025.
- Thinking: manual extended thinking only (`thinking: {"type": "enabled", "budget_tokens": N}`). The effort parameter is not supported.
- Input: text and images. Output: text.
- Context awareness: the model tracks its remaining context budget during a conversation.
- API ID: `claude-haiku-4-5` resolves to the snapshot `claude-haiku-4-5-20251001`. Anthropic lists retirement as not sooner than October 15, 2026.

## Keep tasks small and explicit

Haiku responds best to one clear job with a stated output format. Apply Anthropic's general principles:

- Be clear and direct. Say exactly what output you want and in what format.
- Explain why a constraint exists. The model generalizes from the reason.
- Wrap different kinds of input in XML tags such as `<instructions>`, `<context>`, and `<input>`.
- For long inputs, put the documents first and the question last.
- Say what to do, not what to avoid. For example, "Answer in flowing prose paragraphs" works better than "Do not use markdown".

## Thinking budget

Set a small `budget_tokens` for scoped tasks and raise it only when evals show a gain. `max_tokens` must cover both the thinking budget and the answer. Do not copy effort-based settings from newer Claude models. Haiku 4.5 does not accept `effort`.

## Images

State what visible evidence to inspect and what to ignore. Ask the model to separate what it sees from what it infers, and to say "not visible" when a detail cannot be read. For dense technical images, prefer a stronger vision model or tools that crop and zoom.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Request rejected for `effort` | Remove `effort`. Use `budget_tokens` if thinking is needed. |
| Output truncated with thinking on | Raise `max_tokens` above the thinking budget plus the expected answer. |
| Instruction ignored on long input | Put documents first, the question last, and delimit inputs with XML tags. |
| Guesses about unreadable image detail | Require "not visible" for details the image does not show. |
| Task needs broad reasoning or 1M context | Route it to a larger model. |

## Sources

- Anthropic, [Claude Haiku 4.5 overview](https://platform.claude.com/docs/en/models/haiku-4-5/overview)
- Anthropic, [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- Anthropic, [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- Anthropic, [Choosing the right model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- Anthropic, [Introducing Claude Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5)
